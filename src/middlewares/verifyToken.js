const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

module.exports = async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Invalid Authorization header format. Expected: Bearer <token>' });
    }

    const token = parts[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // decoded should contain at least id/email/role per registration/login token creation
    if (!decoded || (!decoded.id && !decoded.email)) {
      return res.status(401).json({ message: 'Token payload invalid' });
    }

    // fetch user from DB to ensure user still exists and to get fresh role/data
    const db = getDB();
    const query = decoded.id ? { _id: new ObjectId(decoded.id) } : { email: String(decoded.email).toLowerCase() };
    const user = await db.collection('users').findOne(query);

    if (!user) return res.status(401).json({ message: 'User not found (invalid token)' });

    // attach sanitized user to req.user (avoid exposing password)
    const { password, ...safeUser } = user;
    req.user = safeUser;

    next();
  } catch (err) {
    console.error('verifyToken error:', err);
    return res.status(500).json({ message: 'Internal server error in auth' });
  }
};
