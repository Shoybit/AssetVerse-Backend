// src/routes/assets.route.js
const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { getDB } = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');
const verifyHR = require('../middlewares/verifyHR');

/**
 * POST /assets
 * HR only - create new asset
 */
router.post('/', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user; // verifyToken 

    const {
      productName,
      productImage = null,
      productType,
      productQuantity,
      companyName = hr.companyName || null
    } = req.body;

    if (!productName || !productType || !productQuantity) {
      return res.status(400).json({ message: 'productName, productType and productQuantity are required' });
    }

    if (!['Returnable', 'Non-returnable'].includes(productType)) {
      return res.status(400).json({ message: 'productType must be "Returnable" or "Non-returnable"' });
    }

    const qty = Number(productQuantity);
    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ message: 'productQuantity must be a non-negative integer' });
    }

    const now = new Date();
    const assetDoc = {
      productName: String(productName),
      productImage: productImage || null,
      productType,
      productQuantity: qty,
      availableQuantity: qty,
      dateAdded: now,
      hrEmail: hr.email,
      companyName: companyName || null,
    };

    const result = await db.collection('assets').insertOne(assetDoc);
    const created = await db.collection('assets').findOne({ _id: result.insertedId });

    return res.status(201).json({ message: 'Asset created', asset: created });
  } catch (err) {
    console.error('Create asset error:', err);
    return res.status(500).json({ message: 'Failed to create asset', error: err.message });
  }
});

/**
 * GET /assets
 * Public - paginated list with optional search & filter
 * Query params:
 *   page (default 1), limit (default 10), q (search productName), type (Returnable|Non-returnable), company (companyName)
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;

    const q = req.query.q ? String(req.query.q).trim() : null;
    const type = req.query.type ? String(req.query.type) : null;
    const company = req.query.company ? String(req.query.company).trim() : null;

    const filter = {};
    if (q) filter.productName = { $regex: q, $options: 'i' };
    if (type && ['Returnable', 'Non-returnable'].includes(type)) filter.productType = type;
    if (company) filter.companyName = company;

    // Only return assets with availableQuantity > 0 by default? Spec shows listing all; keep all but allow client to filter.
    const total = await db.collection('assets').countDocuments(filter);
    const cursor = db.collection('assets')
      .find(filter)
      .sort({ dateAdded: -1 })
      .skip(skip)
      .limit(limit);

    const items = await cursor.toArray();

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    console.error('Get assets error:', err);
    return res.status(500).json({ message: 'Failed to fetch assets', error: err.message });
  }
});



/**
 * DELETE /assets/:id
 * HR only - delete asset
 */
router.delete('/:id', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid asset id' });

    const hr = req.user;
    const existing = await db.collection('assets').findOne({ _id: new ObjectId(id) });
    if (!existing) return res.status(404).json({ message: 'Asset not found' });

    if (existing.hrEmail !== hr.email) {
      return res.status(403).json({ message: 'Not authorized to delete this asset' });
    }

    const assignedCount = await db.collection('assignedAssets').countDocuments({ assetId: new ObjectId(id), status: 'assigned' });
    if (assignedCount > 0) {
      return res.status(400).json({ message: 'Cannot delete asset with currently assigned items' });
    }

    await db.collection('assets').deleteOne({ _id: new ObjectId(id) });

    return res.json({ message: 'Asset deleted' });
  } catch (err) {
    console.error('Delete asset error:', err);
    return res.status(500).json({ message: 'Failed to delete asset', error: err.message });
  }
});

module.exports = router;
