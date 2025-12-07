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

/**
 * DELETE /affiliations/:employeeEmail
 * HR-only: remove employee affiliation for this HR.
 * Transactional steps:
 *  - verify affiliation exists and belongs to this HR
 *  - find assignedAssets for employee under this HR with status 'assigned'
 *  - for each assigned: mark assignedAssets.status='returned', set returnDate; increment assets.availableQuantity
 *  - update related requests (approved -> returned)
 *  - delete affiliation document
 *  - decrement users.currentEmployees for HR
 */
router.delete('/:employeeEmail', verifyToken, verifyHR, async (req, res) => {
  const db = getDB();
  const client = getClient();
  const hr = req.user;
  const employeeEmail = String(req.params.employeeEmail || '').toLowerCase();

  if (!employeeEmail) return res.status(400).json({ message: 'employeeEmail is required in params' });

  const session = client.startSession();
  try {
    let resultSummary = null;

    await session.withTransaction(async () => {
      const affColl = db.collection('employeeAffiliations');
      const assignedColl = db.collection('assignedAssets');
      const assetsColl = db.collection('assets');
      const requestsColl = db.collection('requests');
      const usersColl = db.collection('users');

      // 1) Find affiliation
      const affiliation = await affColl.findOne(
        { employeeEmail: employeeEmail, hrEmail: hr.email },
        { session }
      );
      if (!affiliation) throw new Error('Affiliation not found for this employee under your company');

      // 2) Find assigned assets for this employee under this HR with status 'assigned'
      const assignedCursor = assignedColl.find(
        { employeeEmail: employeeEmail, hrEmail: hr.email, status: 'assigned' },
        { session }
      );

      const assignedList = await assignedCursor.toArray();

      // 3) For each assigned asset: mark returned and increment asset.availableQuantity
      const now = new Date();
      for (const assigned of assignedList) {
        // update assignedAssets status
        await assignedColl.updateOne(
          { _id: assigned._id },
          { $set: { status: 'returned', returnDate: now } },
          { session }
        );

        // increment asset availableQuantity if asset exists
        if (assigned.assetId) {
          await assetsColl.updateOne(
            { _id: new ObjectId(assigned.assetId) },
            { $inc: { availableQuantity: 1 } },
            { session }
          );

          // mark related request as returned if there is one that was approved
          await requestsColl.updateOne(
            {
              assetId: new ObjectId(assigned.assetId),
              requesterEmail: employeeEmail,
              requestStatus: 'approved'
            },
            { $set: { requestStatus: 'returned' } },
            { session }
          );
        }
      }

      // 4) Delete affiliation
      await affColl.deleteOne({ _id: affiliation._id }, { session });

      // 5) Decrement hr's currentEmployees (but not below 0)
      await usersColl.updateOne(
        { email: hr.email },
        { $inc: { currentEmployees: -1 } },
        { session }
      );

      resultSummary = {
        message: 'Employee removed and assignments returned',
        removedAffiliation: affiliation,
        returnedCount: assignedList.length
      };
    }, {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    });

    await session.endSession();
    return res.json(resultSummary);
  } catch (err) {
    try { await session.abortTransaction(); } catch(e){/*ignore*/ }
    session.endSession();
    console.error('Remove affiliation error:', err);
    return res.status(400).json({ message: err.message || 'Failed to remove affiliation' });
  }
});


module.exports = router;
