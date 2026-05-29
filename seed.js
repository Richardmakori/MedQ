// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Admin
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mediq.co.ke' },
    update: {},
    create: {
      name: 'Platform Admin',
      email: 'admin@mediq.co.ke',
      passwordHash: adminHash,
      role: 'ADMIN',
      emailVerified: true,
    },
  });

  // Doctor users
  const doctorHash = await bcrypt.hash('Doctor1234!', 12);

  const drMwangiUser = await prisma.user.upsert({
    where: { email: 'j.mwangi@mediq.co.ke' },
    update: {},
    create: {
      name: 'Dr. James Mwangi',
      email: 'j.mwangi@mediq.co.ke',
      passwordHash: doctorHash,
      phone: '0712345678',
      role: 'DOCTOR',
      emailVerified: true,
    },
  });

  const drOseiUser = await prisma.user.upsert({
    where: { email: 'l.osei@mediq.co.ke' },
    update: {},
    create: {
      name: 'Dr. Linda Osei',
      email: 'l.osei@mediq.co.ke',
      passwordHash: doctorHash,
      phone: '0723456789',
      role: 'DOCTOR',
      emailVerified: true,
    },
  });

  const drMutuaUser = await prisma.user.upsert({
    where: { email: 'f.mutua@mediq.co.ke' },
    update: {},
    create: {
      name: 'Dr. Faith Mutua',
      email: 'f.mutua@mediq.co.ke',
      passwordHash: doctorHash,
      phone: '0734567890',
      role: 'DOCTOR',
      emailVerified: true,
    },
  });

  // Doctor profiles
  const drMwangi = await prisma.doctor.upsert({
    where: { userId: drMwangiUser.id },
    update: {},
    create: {
      userId: drMwangiUser.id,
      specialization: 'General Practice',
      licenseNumber: 'KMB-2020-0041',
      bio: 'Experienced general practitioner with over 10 years of patient care in Nairobi. Specialises in preventive medicine and chronic disease management.',
      yearsExperience: 10,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedBy: admin.id,
    },
  });

  const drOsei = await prisma.doctor.upsert({
    where: { userId: drOseiUser.id },
    update: {},
    create: {
      userId: drOseiUser.id,
      specialization: 'Cardiology',
      licenseNumber: 'KMB-2018-0019',
      bio: 'Consultant cardiologist specialising in heart disease prevention, ECG interpretation, and hypertension management.',
      yearsExperience: 14,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedBy: admin.id,
    },
  });

  const drMutua = await prisma.doctor.upsert({
    where: { userId: drMutuaUser.id },
    update: {},
    create: {
      userId: drMutuaUser.id,
      specialization: 'Dermatology',
      licenseNumber: 'KMB-2021-0088',
      bio: 'Dermatologist focused on skin health, cosmetic procedures, and treatment of chronic skin conditions.',
      yearsExperience: 6,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedBy: admin.id,
    },
  });

  // Services
  await prisma.service.createMany({
    skipDuplicates: true,
    data: [
      { doctorId: drMwangi.id, title: 'General Consultation', description: 'Full check-up, symptom review, and treatment plan.', price: 1500, durationMinutes: 30 },
      { doctorId: drMwangi.id, title: 'Follow-up Visit', description: 'Review of ongoing treatment and medication.', price: 800, durationMinutes: 20 },
      { doctorId: drMwangi.id, title: 'Health Screening', description: 'Comprehensive blood panel and vitals check.', price: 3200, durationMinutes: 45, requiresDocs: true },
      { doctorId: drOsei.id, title: 'Cardio Screening', description: 'ECG, blood pressure and cardiovascular risk assessment.', price: 4500, durationMinutes: 60, requiresDocs: true },
      { doctorId: drOsei.id, title: 'Cardiology Follow-up', description: 'Post-treatment review and medication adjustment.', price: 2000, durationMinutes: 30 },
      { doctorId: drMutua.id, title: 'Skin Consultation', description: 'Diagnosis and personalised treatment plan for skin conditions.', price: 2200, durationMinutes: 30 },
      { doctorId: drMutua.id, title: 'Acne Management Program', description: 'Ongoing skin care program with progress tracking.', price: 1800, durationMinutes: 25 },
    ],
  });

  // Availability (Mon–Fri, 9am–5pm)
  const days = [1, 2, 3, 4, 5]; // Mon-Fri
  for (const doctor of [drMwangi, drOsei, drMutua]) {
    for (const day of days) {
      await prisma.availability.upsert({
        where: { doctorId_dayOfWeek_startTime: { doctorId: doctor.id, dayOfWeek: day, startTime: '09:00' } },
        update: {},
        create: { doctorId: doctor.id, dayOfWeek: day, startTime: '09:00', endTime: '17:00' },
      });
    }
  }

  // Patient
  const patientHash = await bcrypt.hash('Patient1234!', 12);
  await prisma.user.upsert({
    where: { email: 'amira.kamau@example.com' },
    update: {},
    create: {
      name: 'Amira Kamau',
      email: 'amira.kamau@example.com',
      passwordHash: patientHash,
      phone: '0756789012',
      role: 'PATIENT',
      emailVerified: true,
    },
  });

  console.log('✅ Seed complete.');
  console.log('');
  console.log('Test accounts:');
  console.log('  Admin:   admin@mediq.co.ke     / Admin1234!');
  console.log('  Doctor:  j.mwangi@mediq.co.ke  / Doctor1234!');
  console.log('  Patient: amira.kamau@example.com / Patient1234!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
