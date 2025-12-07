// src/routes/protected.route.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const verifyHR = require('../middlewares/verifyHR');

/**
 * GET /protected/me
 * returns the authenticated user's sanitized info
 */
router.get('/me', verifyToken, (req, res) => {
  return res.json({ message: 'Authenticated', user: req.user });
});

/**
 * GET /protected/hr-only
 * HR-only endpoint example
 */
router.get('/hr-only', verifyToken, verifyHR, (req, res) => {
  return res.json({ message: 'Hello HR — access granted', hrEmail: req.user.email, companyName: req.user.companyName || null });
});

module.exports = router;
