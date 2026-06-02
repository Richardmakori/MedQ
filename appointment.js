// src/routes/appointments.js
const express = require('express');
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { authenticate, authorize, requireVerifiedDoctor } = require('../middleware/auth');
const { audit } = require('../utils/audit');

const router = express.Router();

const bookSchema = z.object({
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  appointmentDatetime: z.string().datetime(),
  patientNotes: z.string().max(1000).optional(),
});

// ─── GET /api/appointments ── Auth: list appointments for current user ─────────
router.get('/', authenticate, async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let where = {};
  if (req.user.role === 'PATIENT') {
    where.patientId = req.user.userId;
  } else if (req.user.role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.userId } });
    if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
    where.doctorId = doctor.id;
  }
  if (status) where.status = status;

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
        doctor: { include: { user: { select: { name: true, avatarUrl: true } } } },
        service: { select: { id: true, title: true, price: true, durationMinutes: true } },
        prescription: { select: { id: true, issuedAt: true } },
        payment: { select: { id: true, status: true, amount: true } },
        _count: { select: { documents: true } },
      },
      orderBy: { appointmentDatetime: 'desc' },
    }),
    prisma.appointment.count({ where }),
  ]);

  res.json({
    appointments,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ─── GET /api/appointments/:id ── Auth: single appointment ────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: {
      patient: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
      doctor: { include: { user: { select: { name: true, avatarUrl: true } } } },
      service: true,
      prescription: true,
      documents: true,
      payment: true,
    },
  });

  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  // Access control: only the patient, the doctor, or an admin can view
  const isPatient = req.user.role === 'PATIENT' && appt.patientId === req.user.userId;
  const isDoctor = req.user.role === 'DOCTOR' && appt.doctor.userId === req.user.userId;
  const isAdmin = req.user.role === 'ADMIN';

  if (!isPatient && !isDoctor && !isAdmin) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  res.json({ appointment: appt });
});

// ─── POST /api/appointments ── Patient books an appointment ───────────────────
router.post('/', authenticate, authorize('PATIENT'), async (req, res) => {
  const data = bookSchema.parse(req.body);

  // Validate doctor and service exist and are active
  const [doctor, service] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: data.doctorId } }),
    prisma.service.findUnique({ where: { id: data.serviceId } }),
  ]);

  if (!doctor || doctor.verificationStatus !== 'VERIFIED') {
    return res.status(400).json({ error: 'Doctor not found or not verified.' });
  }
  if (!service || service.doctorId !== data.doctorId || !service.isActive) {
    return res.status(400).json({ error: 'Service not found or not offered by this doctor.' });
  }

  // Check slot is not already taken
  const apptDate = new Date(data.appointmentDatetime);
  const slotEnd = new Date(apptDate.getTime() + service.durationMinutes * 60 * 1000);

  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId: data.doctorId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      appointmentDatetime: { gte: apptDate, lt: slotEnd },
    },
  });

  if (conflict) return res.status(409).json({ error: 'This time slot is no longer available.' });

  const appointment = await prisma.appointment.create({
    data: {
      patientId: req.user.userId,
      doctorId: data.doctorId,
      serviceId: data.serviceId,
      appointmentDatetime: apptDate,
      durationMinutes: service.durationMinutes,
      patientNotes: data.patientNotes,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
    },
    include: {
      doctor: { include: { user: { select: { name: true } } } },
      service: true,
    },
  });

  await audit({ userId: req.user.userId, action: 'APPOINTMENT_BOOKED', entityType: 'Appointment', entityId: appointment.id, req });

  res.status(201).json({ appointment });
});

// ─── PATCH /api/appointments/:id/status ── Doctor or Admin updates status ─────
router.patch('/:id/status', authenticate, async (req, res) => {
  const { status, doctorNotes, cancelReason } = req.body;

  const validStatuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}.` });
  }

  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { doctor: true },
  });
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  // Doctors can only update their own appointments
  if (req.user.role === 'DOCTOR' && appt.doctor.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  // Patients can only cancel their own
  if (req.user.role === 'PATIENT') {
    if (appt.patientId !== req.user.userId) return res.status(403).json({ error: 'Access denied.' });
    if (status !== 'CANCELLED') return res.status(403).json({ error: 'Patients may only cancel appointments.' });
  }

  const updated = await prisma.appointment.update({
    where: { id: req.params.id },
    data: {
      status,
      ...(doctorNotes && { doctorNotes }),
      ...(status === 'CANCELLED' && {
        cancelledBy: req.user.userId,
        cancelReason: cancelReason || null,
      }),
    },
  });

  await audit({ userId: req.user.userId, action: `APPOINTMENT_${status}`, entityType: 'Appointment', entityId: appt.id, req });

  res.json({ appointment: updated });
});

module.exports = router;
