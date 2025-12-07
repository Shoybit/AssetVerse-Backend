// src/routes/packages.route.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../config/db');

/**
 * GET /packages
 * Public: return the packages available (from DB). If you prefer static packages, seed them in DB.
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const packages = await db.collection('packages').find({}).toArray();
    return res.json({ packages });
  } catch (err) {
    console.error('Get packages error:', err);
    return res.status(500).json({ message: 'Failed to fetch packages', error: err.message });
  }
});

/**
 * Optional: admin endpoints to create/update/delete packages can be added later.
 */

module.exports = router;
