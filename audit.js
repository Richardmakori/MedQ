// src/utils/audit.js
const prisma = require('./prisma');

const audit = async ({ userId, action, entityType, entityId, metadata, req }) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityType: entityType || null,
        entityId: entityId || null,
        metadata: metadata || null,
        ipAddress: req?.ip || null,
      },
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { audit };
