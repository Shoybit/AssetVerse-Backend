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
 * GET /assigned-assets/company
 * HR-only: list assigned assets for this HR
 * Query: page, limit
 */
router.get('/company', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user;

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;

    const filter = { hrEmail: hr.email };
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
    console.error('Get company assigned assets error:', err);
    return res.status(500).json({ message: 'Failed to fetch assigned assets', error: err.message });
  }
});


/**
 * POST /assigned-assets/:id/return
 * Employee-only: return an assigned asset.
 *
 * Transactional steps:
 *  - verify assigned asset exists and belongs to authenticated employee
 *  - verify status === 'assigned'
 *  - verify asset is returnable (asset.productType === 'Returnable')
 *  - mark assignedAssets.status = 'returned', set returnDate
 *  - increment assets.availableQuantity by 1
 *  - optionally, mark related request.requestStatus = 'returned' (if request exists)
 */
router.post('/:id/return', verifyToken, async (req, res) => {
  const db = getDB();
  const client = getClient();
  const user = req.user;
  const assignedId = req.params.id;

  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  if (!ObjectId.isValid(assignedId)) return res.status(400).json({ message: 'Invalid assigned asset id' });

  const session = client.startSession();
  try {
    let resultPayload = null;

    await session.withTransaction(async () => {
      const assignedColl = db.collection('assignedAssets');
      const assetsColl = db.collection('assets');
      const requestsColl = db.collection('requests');

      // 1) Fetch assigned asset with session
      const assigned = await assignedColl.findOne({ _id: new ObjectId(assignedId) }, { session });
      if (!assigned) throw new Error('Assigned asset not found');

      // 2) Only the employee who has this assigned asset can return it
      if (String(assigned.employeeEmail).toLowerCase() !== String(user.email).toLowerCase()) {
        throw new Error('Not authorized to return this asset');
      }

      // 3) Must be currently assigned
      if (assigned.status !== 'assigned') {
        throw new Error('Asset is not currently assigned or already returned');
      }

      // 4) Check asset exists and is returnable
      const asset = await assetsColl.findOne({ _id: new ObjectId(assigned.assetId) }, { session });
      if (!asset) throw new Error('Underlying asset record not found');

      if (asset.productType !== 'Returnable') {
        throw new Error('This asset type is non-returnable');
      }

      const now = new Date();

      // 5) Update assignedAssets: set status to 'returned' and returnDate
      await assignedColl.updateOne(
        { _id: assigned._id },
        { $set: { status: 'returned', returnDate: now } },
        { session }
      );

      // 6) Increment assets.availableQuantity by 1
      await assetsColl.updateOne(
        { _id: asset._id },
        { $inc: { availableQuantity: 1 } },
        { session }
      );

      // 7) Optionally update related request (if exists) to 'returned'
      // We try to find a request that matches employee + assetId and status=approved
      const relatedRequest = await requestsColl.findOne(
        {
          assetId: asset._id,
          requesterEmail: assigned.employeeEmail,
          requestStatus: 'approved'
        },
        { session }
      );

      if (relatedRequest) {
        await requestsColl.updateOne(
          { _id: relatedRequest._id },
          { $set: { requestStatus: 'returned' } },
          { session }
        );
      }

      resultPayload = { message: 'Return processed successfully', assignedId: assigned._id.toString(), returnDate: now.toISOString() };
    }, {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    });

    await session.endSession();
    return res.json(resultPayload);
  } catch (err) {
    try { await session.abortTransaction(); } catch(e){/*ignore*/ }
    session.endSession();
    console.error('Return assigned asset error:', err);
    return res.status(400).json({ message: err.message || 'Return failed' });
  }
});


module.exports = router;
