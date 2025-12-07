const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { getDB, getClient } = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');
const verifyHR = require('../middlewares/verifyHR');

/**
 * GET /assigned-assets/my
 * Employee-only: list assigned assets for the authenticated employee
 * Query: page, limit
 */
router.get('/my', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;

    const filter = { employeeEmail: user.email };
    const total = await db.collection('assignedAssets').countDocuments(filter);
    const items = await db.collection('assignedAssets')
      .find(filter)
      .sort({ assignmentDate: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    console.error('Get my assigned assets error:', err);
    return res.status(500).json({ message: 'Failed to fetch assigned assets', error: err.message });
  }
});


/**
 * GET /affiliations/company
 * HR-only: list employees affiliated with this HR's company
 * Query: page, limit, q (search by name/email)
 */
router.get('/company', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user;

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const filter = { hrEmail: hr.email };
    if (q) {
      filter.$or = [
        { employeeName: { $regex: q, $options: 'i' } },
        { employeeEmail: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await db.collection('employeeAffiliations').countDocuments(filter);
    const items = await db.collection('employeeAffiliations')
      .find(filter)
      .sort({ affiliationDate: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    console.error('Get company affiliations error:', err);
    return res.status(500).json({ message: 'Failed to fetch company affiliations', error: err.message });
  }
});




module.exports = router;
