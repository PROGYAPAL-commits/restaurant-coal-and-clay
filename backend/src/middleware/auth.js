const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Verifies a Bearer token and attaches { id, email } to req.user.
// Use on any route that should only work for a logged-in customer.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Same as requireAuth but doesn't fail the request if there's no token —
// just leaves req.user undefined. Useful for routes like "place order" that
// can be used by logged-in customers or walk-ins/guests.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // ignore invalid token, treat as guest
  }
  next();
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET };
