// src/routes/requests.route.js
const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { getDB, getClient } = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');
const verifyHR = require('../middlewares/verifyHR');



/**
 * POST /requests
 * Employee creates a request for an asset.
 * Body: { assetId, note? }
 * - Sets requestStatus = 'pending'
 * - hrEmail and companyName are derived from asset record
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const user = req.user; // from verifyToken
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.role !== 'employee') {
      // employees only for request creation (HRs shouldn't create employee requests)
      // but if you want HRs to create requests on behalf of employees, change this.
      // For now enforce employee-only.
      return res.status(403).json({ message: 'Only employees can create asset requests' });
    }

    const { assetId, note } = req.body;
    if (!assetId || !ObjectId.isValid(assetId)) {
      return res.status(400).json({ message: 'Valid assetId is required' });
    }

    // Fetch asset to get hrEmail and companyName
    const asset = await db.collection('assets').findOne({ _id: new ObjectId(assetId) });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    // Optional: you can disallow requests when availableQuantity <= 0.
    // We'll allow creating requests but HR approval checks availability.
    const requestDoc = {
      assetId: asset._id,
      assetName: asset.productName,
      assetType: asset.productType,
      requesterName: user.name,
      requesterEmail: user.email,
      hrEmail: asset.hrEmail,
      companyName: asset.companyName || null,
      requestDate: new Date(),
      approvalDate: null,
      requestStatus: 'pending',
      note: note || null,
      processedBy: null,
    };

    const result = await db.collection('requests').insertOne(requestDoc);
    const created = await db.collection('requests').findOne({ _id: result.insertedId });

    return res.status(201).json({ message: 'Request created', request: created });
  } catch (err) {
    console.error('Create request error:', err);
    return res.status(500).json({ message: 'Failed to create request', error: err.message });
  }
});


/**
 * GET /requests/my
 * Employee-only: list requests made by the authenticated employee
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

    const filter = { requesterEmail: user.email };
    const total = await db.collection('requests').countDocuments(filter);
    const items = await db.collection('requests')
      .find(filter)
      .sort({ requestDate: -1 })
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
    console.error('Get my requests error:', err);
    return res.status(500).json({ message: 'Failed to fetch requests', error: err.message });
  }
});


/**
 * GET /requests
 * HR-only: list requests for the HR (by hrEmail) with pagination and optional status filter
 * Query params: page, limit, status (pending|approved|rejected)
 */
router.get('/', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user;

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;
    const status = req.query.status ? String(req.query.status) : null;

    const filter = { hrEmail: hr.email };
    if (status && ['pending', 'approved', 'rejected', 'returned'].includes(status)) {
      filter.requestStatus = status;
    }

    const total = await db.collection('requests').countDocuments(filter);
    const items = await db.collection('requests')
      .find(filter)
      .sort({ requestDate: -1 })
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
    console.error('Get HR requests error:', err);
    return res.status(500).json({ message: 'Failed to fetch requests', error: err.message });
  }
});



module.exports = router;
