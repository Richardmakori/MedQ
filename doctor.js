// src/routes/doctors.js
const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate, authorize, requireVerifiedDoctor } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/doctors ─── Public: list verified doctors ───────────────────────
router.get('/', async (req, res) => {
  const { specialization, search, page = 1, limit = 12 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    verificationStatus: 'VERIFIED',
    ...(specialization && { specialization: { contains: specialization, mode: 'insensitive' } }),
    ...(search && {
      OR: [
        { specialization: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };

  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      skip,
      take: parseInt(limit),
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        services: { where: { isActive: true }, select: { id: true, title: true, price: true, durationMinutes: true } },
        _count: { select: { appointments: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.doctor.count({ where }),
  ]);

  res.json({
    doctors,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ─── GET /api/doctors/specializations ── Public: list unique specializations ──
router.get('/specializations', async (req, res) => {
  const specs = await prisma.doctor.findMany({
    where: { verificationStatus: 'VERIFIED' },
    select: { specialization: true },
    distinct: ['specialization'],
    orderBy: { specialization: 'asc' },
  });
  res.json({ specializations: specs.map((s) => s.specialization) });
});

// ─── GET /api/doctors/:id ── Public: single doctor profile ───────────────────
router.get('/:id', async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, createdAt: true } },
      services: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
      availability: { where: { isActive: true }, orderBy: { dayOfWeek: 'asc' } },
      _count: { select: { appointments: true } },
    },
  });

  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  if (doctor.verificationStatus !== 'VERIFIED') {
    return res.status(404).json({ error: 'Doctor not found.' });
  }

  res.json({ doctor });
});

// ─── GET /api/doctors/:id/slots ── Public: available time slots for a date ───
router.get('/:id/slots', async (req, res) => {
  const { date } = req.query; // YYYY-MM-DD
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD).' });

  const d = new Date(date);
  const dayOfWeek = d.getDay();

  const [availability, existingAppointments] = await Promise.all([
    prisma.availability.findFirst({
      where: { doctorId: req.params.id, dayOfWeek, isActive: true },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId: req.params.id,
        appointmentDatetime: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lt: new Date(`${date}T23:59:59.999Z`),
        },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { appointmentDatetime: true, durationMinutes: true },
    }),
  ]);

  if (!availability) return res.json({ slots: [] });

  // Generate 30-min slots between start and end time
  const slots = [];
  const [startH, startM] = availability.startTime.split(':').map(Number);
  const [endH, endM] = availability.endTime.split(':').map(Number);

  let current = startH * 60 + startM;
  const end = endH * 60 + endM;

  while (current + 30 <= end) {
    const hh = String(Math.floor(current / 60)).padStart(2, '0');
    const mm = String(current % 60).padStart(2, '0');
    const slotTime = `${date}T${hh}:${mm}:00.000Z`;

    const isBooked = existingAppointments.some((appt) => {
      const apptStart = new Date(appt.appointmentDatetime).getTime();
      const slotStart = new Date(slotTime).getTime();
      return Math.abs(apptStart - slotStart) < appt.durationMinutes * 60 * 1000;
    });

    slots.push({ time: `${hh}:${mm}`, datetime: slotTime, available: !isBooked });
    current += 30;
  }

  res.json({ slots });
});

// ─── PATCH /api/doctors/profile ── Doctor: update own profile ────────────────
router.patch('/profile', authenticate, authorize('DOCTOR'), async (req, res) => {
  const { bio, yearsExperience, specialization } = req.body;
  const doctor = await prisma.doctor.update({
    where: { userId: req.user.userId },
    data: { bio, yearsExperience, specialization },
  });
  res.json({ doctor });
});

// ─── PUT /api/doctors/availability ── Doctor: set availability ───────────────
router.put('/availability', authenticate, authorize('DOCTOR'), requireVerifiedDoctor, async (req, res) => {
  const { availability } = req.body; // [{ dayOfWeek, startTime, endTime }]
  if (!Array.isArray(availability)) return res.status(400).json({ error: 'availability must be an array.' });

  // Replace all availability for this doctor
  await prisma.availability.deleteMany({ where: { doctorId: req.doctor.id } });

  const created = await prisma.availability.createMany({
    data: availability.map((a) => ({
      doctorId: req.doctor.id,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
  });

  res.json({ message: 'Availability updated.', count: created.count });
});

module.exports = router;
