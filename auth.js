// src/middleware/auth.js
const { verifyAccessToken } = require('../utils/jwt');

// Verify JWT and attach user to request
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { userId, role, email }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Allow only specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

// Doctor must be VERIFIED to access certain routes
const requireVerifiedDoctor = async (req, res, next) => {
  const prisma = require('../utils/prisma');
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.userId } });
    if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
    if (doctor.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({ error: 'Your account is pending verification by an admin.' });
    }
    req.doctor = doctor;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate, authorize, requireVerifiedDoctor };
