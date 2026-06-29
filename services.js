
const express = require('express');
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { authenticate, authorize, requireVerifiedDoctor } = require('../middleware/auth');

const router = express.Router();

const serviceSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  price: z.number().positive(),
  durationMinutes: z.number().int().min(10).max(480),
  requiresDocs: z.boolean().default(false),
});


router.get('/', async (req, res) => {
  const { doctorId } = req.query;
  const where = { isActive: true, ...(doctorId && { doctorId }) };

  const services = await prisma.service.findMany({
    where,
    include: {
      doctor: {
        select: { id: true, specialization: true, user: { select: { name: true, avatarUrl: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ services });
});


router.get('/:id', async (req, res) => {
  const service = await prisma.service.findUnique({
    where: { id: req.params.id },
    include: {
      doctor: {
        include: { user: { select: { name: true, avatarUrl: true } } },
      },
    },
  });
  if (!service || !service.isActive) return res.status(404).json({ error: 'Service not found.' });
  res.json({ service });
});

// ─── POST /api/services ─── Doctor creates a service ─────────────────────────
router.post('/', authenticate, authorize('DOCTOR'), requireVerifiedDoctor, async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const service = await prisma.service.create({
    data: { ...data, doctorId: req.doctor.id },
  });
  res.status(201).json({ service });
});


router.patch('/:id', authenticate, authorize('DOCTOR'), requireVerifiedDoctor, async (req, res) => {
  const service = await prisma.service.findUnique({ where: { id: req.params.id } });
  if (!service || service.doctorId !== req.doctor.id) {
    return res.status(403).json({ error: 'Not authorised to edit this service.' });
  }

  const data = serviceSchema.partial().parse(req.body);
  const updated = await prisma.service.update({ where: { id: req.params.id }, data });
  res.json({ service: updated });
});


router.delete('/:id', authenticate, authorize('DOCTOR'), requireVerifiedDoctor, async (req, res) => {
  const service = await prisma.service.findUnique({ where: { id: req.params.id } });
  if (!service || service.doctorId !== req.doctor.id) {
    return res.status(403).json({ error: 'Not authorised.' });
  }
  await prisma.service.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: 'Service deactivated.' });
});

module.exports = router;
