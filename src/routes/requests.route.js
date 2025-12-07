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



module.exports = router;
