const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/db');

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// Helper to sanitize user object before sending back
function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

/**
 * POST /auth/register
 * 
 * For Front end Implementation
 * body for HR:
 * {
 *   name, companyName, companyLogo, email, password, dateOfBirth, role: "hr"
 * }
 *
 * body for Employee:
 * {
 *   name, email, password, dateOfBirth, role: "employee"
 * }
 *
 * Returns: created user (sanitized) and a JWT token
 */
router.post('/register', async (req, res) => {
  try {
    const db = getDB();
    const { name, email, password, dateOfBirth, role } = req.body;

    if (!name || !email || !password || !dateOfBirth || !role) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // Check role validity
    if (!['hr', 'employee'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "hr" or "employee"' });
    }

    // Additional HR fields
    let companyName = null;
    let companyLogo = null;
    if (role === 'hr') {
      companyName = req.body.companyName || null;
      companyLogo = req.body.companyLogo || null;
      if (!companyName) {
        return res.status(400).json({ message: 'HR registration requires companyName' });
      }
    }

    // Check existing user
    const existing = await db.collection('users').findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    // Build user object according to spec
    const now = new Date();
    const userDoc = {
      name,
      email: normalizedEmail,
      password: hashed,
      dateOfBirth: new Date(dateOfBirth),
      role,
      profileImage: req.body.profileImage || null,
      createdAt: now,
      updatedAt: now,
    };

    if (role === 'hr') {
      userDoc.companyName = companyName;
      userDoc.companyLogo = companyLogo;
      userDoc.packageLimit = Number(req.body.packageLimit) || 5; // default 5
      userDoc.currentEmployees = 0;
      userDoc.subscription = req.body.subscription || 'basic';
    }

    const result = await db.collection('users').insertOne(userDoc);
    const createdUser = result.ops ? result.ops[0] : { ...userDoc, _id: result.insertedId }; // ops compatibility

    // create jwt token
    const tokenPayload = {
      id: createdUser._id,
      email: createdUser.email,
      role: createdUser.role,
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: 'Registration successful',
      user: sanitizeUser(createdUser),
      token,
    });
  } catch (err) {
    console.error('Register error:', err);
    // handle duplicate key edge-case if index didn't catch it earlier
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email already exists' });
    }
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

/**
 * POST /auth/login
 * body: { email, password }
 * returns: token + user (sanitized)
 */
router.post('/login', async (req, res) => {
  try {
    const db = getDB();
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await db.collection('users').findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

module.exports = router;
