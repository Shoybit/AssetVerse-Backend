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



/**
 * PUT /requests/:id/approve
 * HR-only: Approve a pending request.
 * Transactional:
 *  - confirm request pending & belongs to this HR
 *  - ensure asset availableQuantity > 0
 *  - decrement asset.availableQuantity by 1
 *  - create assignedAssets entry
 *  - set request.requestStatus = 'approved', approvalDate, processedBy
 *  - if employeeAffiliation doesn't exist, ensure HR.packageLimit allows new employee, then create affiliation and increment HR.currentEmployees
 */
router.put('/:id/approve', verifyToken, verifyHR, async (req, res) => {
  const db = getDB();
  const client = getClient();
  const hr = req.user;
  const reqId = req.params.id;

  if (!ObjectId.isValid(reqId)) return res.status(400).json({ message: 'Invalid request id' });

  const session = client.startSession();
  try {
    let resultDoc = null;
    await session.withTransaction(async () => {
      const requestsColl = db.collection('requests');
      const assetsColl = db.collection('assets');
      const assignedColl = db.collection('assignedAssets');
      const affColl = db.collection('employeeAffiliations');
      const usersColl = db.collection('users');

      // 1) Fetch request (for update)
      const request = await requestsColl.findOne({ _id: new ObjectId(reqId) }, { session });
      if (!request) throw new Error('Request not found');
      if (request.hrEmail !== hr.email) throw new Error('Not authorized for this request');
      if (request.requestStatus !== 'pending') throw new Error('Request not pending');

      // 2) Ensure asset has availableQuantity > 0 and decrement it
      const asset = await assetsColl.findOne({ _id: new ObjectId(request.assetId) }, { session });
      if (!asset) throw new Error('Associated asset not found');

      if ((asset.availableQuantity || 0) <= 0) throw new Error('Asset not available');

      const updateAssetRes = await assetsColl.updateOne(
        { _id: asset._id, availableQuantity: { $gt: 0 } },
        { $inc: { availableQuantity: -1 } },
        { session }
      );
      if (updateAssetRes.matchedCount === 0) throw new Error('Failed to decrement asset (concurrent update?)');

      // 3) Create assignedAssets entry
      const assignedDoc = {
        assetId: asset._id,
        assetName: asset.productName,
        assetImage: asset.productImage || null,
        assetType: asset.productType,
        employeeEmail: request.requesterEmail,
        employeeName: request.requesterName,
        hrEmail: hr.email,
        companyName: request.companyName || null,
        assignmentDate: new Date(),
        returnDate: null,
        status: 'assigned'
      };
      const assignedRes = await assignedColl.insertOne(assignedDoc, { session });

      // 4) Update request to approved
      const now = new Date();
      await requestsColl.updateOne(
        { _id: request._id },
        {
          $set: {
            requestStatus: 'approved',
            approvalDate: now,
            processedBy: hr.email
          }
        },
        { session }
      );

      // 5) Create affiliation if needed, and enforce packageLimit
      const existingAff = await affColl.findOne(
        { employeeEmail: request.requesterEmail, hrEmail: hr.email },
        { session }
      );

      if (!existingAff) {
        // check HR packageLimit
        const hrUser = await usersColl.findOne({ email: hr.email }, { session });
        if (!hrUser) throw new Error('HR user not found');
        const packageLimit = Number(hrUser.packageLimit || 0);
        const currentEmployees = Number(hrUser.currentEmployees || 0);

        if (currentEmployees + 1 > packageLimit) {
          throw new Error('Package employee limit reached; cannot create new affiliation. Please upgrade package.');
        }

        const affDoc = {
          employeeEmail: request.requesterEmail,
          employeeName: request.requesterName,
          hrEmail: hr.email,
          companyName: request.companyName || null,
          companyLogo: request.companyLogo || null,
          affiliationDate: new Date(),
          status: 'active'
        };
        await affColl.insertOne(affDoc, { session });

        // increment hr currentEmployees
        await usersColl.updateOne(
          { email: hr.email },
          { $inc: { currentEmployees: 1 } },
          { session }
        );
      }

      // Return helpful result
      resultDoc = { message: 'Request approved', assignedId: assignedRes.insertedId };
    }, {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    });

    await session.endSession();
    return res.json(resultDoc);
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    session.endSession();
    console.error('Approve request error:', err);
    return res.status(400).json({ message: err.message || 'Approval failed' });
  }
});


/**
 * PUT /requests/:id/reject
 * HR-only: mark request as 'rejected'
 */
router.put('/:id/reject', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user;
    const reqId = req.params.id;
    if (!ObjectId.isValid(reqId)) return res.status(400).json({ message: 'Invalid request id' });

    const request = await db.collection('requests').findOne({ _id: new ObjectId(reqId) });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.hrEmail !== hr.email) return res.status(403).json({ message: 'Not authorized' });
    if (request.requestStatus !== 'pending') return res.status(400).json({ message: 'Only pending requests can be rejected' });

    const now = new Date();
    await db.collection('requests').updateOne(
      { _id: request._id },
      {
        $set: {
          requestStatus: 'rejected',
          approvalDate: now,
          processedBy: hr.email
        }
      }
    );

    return res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error('Reject request error:', err);
    return res.status(500).json({ message: 'Failed to reject request', error: err.message });
  }
});



module.exports = router;
