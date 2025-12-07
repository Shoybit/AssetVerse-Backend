// src/routes/payments.route.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { ObjectId } = require('mongodb');
const { getDB, getClient } = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');
const verifyHR = require('../middlewares/verifyHR');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * POST /payments/checkout
 * HR-only: create a Stripe Checkout Session for chosen package.
 * Body: { packageId }  OR { name, price, employeeLimit } if you want dynamic
 *
 * Returns: { url } (the stripe checkout url to redirect the user to)
 */
router.post('/checkout', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user;
    const { packageId } = req.body;

    if (!packageId) return res.status(400).json({ message: 'packageId required' });

    // fetch package details
    const pkg = await db.collection('packages').findOne({ _id: new ObjectId(packageId) });
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    const amount = Math.round(Number(pkg.price) * 100); // price assumed in USD (or smallest currency unit conversion)
    // create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AssetVerse - ${pkg.name} Package`,
            description: `Upgrade to ${pkg.name} (${pkg.employeeLimit} employees)`,
          },
          unit_amount: amount,
        },
        quantity: 1
      }],
      // important: include metadata so webhook can update DB
      metadata: {
        hrEmail: hr.email,
        packageId: String(pkg._id),
        packageName: pkg.name,
        employeeLimit: String(pkg.employeeLimit)
      },
      success_url: `${CLIENT_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/payments/cancel`
    });

    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ message: 'Failed to create checkout session', error: err.message });
  }
});

/**
 * POST /payments/webhook
 * Stripe webhook endpoint (must receive raw body)
 *
 * - listens for `checkout.session.completed`
 * - verifies signature using STRIPE_WEBHOOK_SECRET
 * - on success: record payment in payments collection and update HR packageLimit (immediately)
 *
 * IMPORTANT: This route must be mounted with express.raw body parser (see wiring below).
 */
async function handleStripeWebhook(req, res) {
  const db = getDB();
  let event = null;
  const sig = req.headers['stripe-signature'];

  try {
    // verify signature
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const hrEmail = metadata.hrEmail;
      const packageId = metadata.packageId;
      const packageName = metadata.packageName;
      const employeeLimit = Number(metadata.employeeLimit || 0);

      // Transactionally record payment and update HR packageLimit
      const client = getClient();
      const sessionDB = client.startSession();
      try {
        await sessionDB.withTransaction(async () => {
          // 1) record payment
          const paymentDoc = {
            hrEmail: hrEmail || null,
            packageId: packageId ? new ObjectId(packageId) : null,
            packageName: packageName || null,
            employeeLimit: employeeLimit,
            amount: session.amount_total || null,
            currency: session.currency || null,
            transactionId: session.id,
            paymentDate: new Date(),
            status: 'completed',
            rawSession: session
          };
          await db.collection('payments').insertOne(paymentDoc, { session: sessionDB });

          // 2) update HR user's packageLimit (overwrite or increase)
          if (hrEmail && employeeLimit > 0) {
            // Option: we set packageLimit = employeeLimit (replace). If you prefer add-on behavior, change accordingly.
            await db.collection('users').updateOne(
              { email: hrEmail },
              { $set: { packageLimit: employeeLimit, subscription: packageName || 'upgraded' } },
              { session: sessionDB }
            );
          }
        });
      } finally {
        await sessionDB.endSession();
      }

      // respond 200 to Stripe
      return res.json({ received: true });
    }

    // handle other event types as needed
    return res.json({ received: true });
  } catch (err) {
    console.error('Processing webhook failed:', err);
    return res.status(500).send('Webhook processing error');
  }
}

/**
 * GET /payments/history
 * HR-only: list payment history for authenticated HR
 */
router.get('/history', verifyToken, verifyHR, async (req, res) => {
  try {
    const db = getDB();
    const hr = req.user;
    const items = await db.collection('payments').find({ hrEmail: hr.email }).sort({ paymentDate: -1 }).toArray();
    return res.json({ items });
  } catch (err) {
    console.error('Get payments history error:', err);
    return res.status(500).json({ message: 'Failed to fetch payments', error: err.message });
  }
});

/**
 * DEV ONLY: POST /payments/simulate
 * Simulate a checkout.session.completed webhook for development without Stripe.
 * Protected with an env secret SIMULATE_SECRET to avoid accidental abuse.
 * Body: { session: <object> } where session.metadata must contain hrEmail, packageId, packageName, employeeLimit
 */
router.post('/simulate', async (req, res) => {
  try {
    const SIM_SECRET = process.env.SIMULATE_SECRET || null;
    const header = req.headers['x-simulate-secret'] || null;
    if (!SIM_SECRET || header !== SIM_SECRET) {
      return res.status(403).json({ message: 'Simulate secret missing or invalid' });
    }

    const sessionObj = req.body.session;
    if (!sessionObj || !sessionObj.metadata) return res.status(400).json({ message: 'session with metadata required' });

    // Create a fake stripe event object shape similar to checkout.session.completed
    const fakeEvent = { type: 'checkout.session.completed', data: { object: sessionObj } };

    // Call the same handler logic by temporarily constructing request-like object
    // We'll call the internal handler function but without signature verification.
    // To reuse code, create a small wrapper that accepts the fake event.
    // For convenience here, just inline the logic similar to the webhook handler:

    const db = getDB();
    const client = getClient();
    const metadata = sessionObj.metadata || {};
    const hrEmail = metadata.hrEmail;
    const packageId = metadata.packageId;
    const packageName = metadata.packageName;
    const employeeLimit = Number(metadata.employeeLimit || 0);

    const s = client.startSession();
    try {
      await s.withTransaction(async () => {
        const paymentDoc = {
          hrEmail: hrEmail || null,
          packageId: packageId ? new ObjectId(packageId) : null,
          packageName: packageName || null,
          employeeLimit: employeeLimit,
          amount: sessionObj.amount_total || null,
          currency: sessionObj.currency || null,
          transactionId: sessionObj.id || `sim_${Date.now()}`,
          paymentDate: new Date(),
          status: 'completed',
          rawSession: sessionObj
        };
        await db.collection('payments').insertOne(paymentDoc, { session: s });

        if (hrEmail && employeeLimit > 0) {
          await db.collection('users').updateOne(
            { email: hrEmail },
            { $set: { packageLimit: employeeLimit, subscription: packageName || 'upgraded' } },
            { session: s }
          );
        }
      });
    } finally {
      await s.endSession();
    }

    return res.json({ message: 'Simulated webhook processed' });
  } catch (err) {
    console.error('Simulate webhook error:', err);
    return res.status(500).json({ message: 'Simulate failed', error: err.message });
  }
});

module.exports = { paymentsRouter: router, stripeWebhookHandler: handleStripeWebhook };
