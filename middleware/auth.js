const jwt = require('jsonwebtoken');
const { JWT_SECRET, pool } = require('../config/db');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.query.token;
  const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader);
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;

    // If institution_id is missing (stale JWT from before multi-tenancy), fetch from DB
    if (req.user.institution_id == null) {
      try {
        const result = await pool.query(
          'SELECT institution_id FROM users WHERE user_id=$1',
          [user.user_id]
        );
        req.user.institution_id = result.rows[0]?.institution_id ?? null;
      } catch (_) {
        // Non-fatal — institution_id stays null
      }
    }

    next();
  });
};

const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role_name)) return res.status(403).json({ error: 'Access denied' });
  next();
};

module.exports = { authenticateToken, authorizeRole };
