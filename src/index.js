require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const app = express();

// ---------------------------------------------
// IMPORT STRIPE WEBHOOK HANDLER BEFORE USING IT
// ---------------------------------------------
const {
  paymentsRouter,
  stripeWebhookHandler,
} = require("./routes/payments.route");

// ---------------------------------------------
// STRIPE WEBHOOK ROUTE MUST USE express.raw()
// MUST BE DECLARED BEFORE express.json()
// ---------------------------------------------
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

// Normal middleware AFTER webhook
app.use(cors());
app.use(express.json());

// ---------------------------------------------
// CONNECT DB AND THEN MOUNT ROUTES
// ---------------------------------------------
connectDB()
  .then(() => {
    // ROUTES

    // Auth Routes
    const authRoutes = require("./routes/auth.route.js");
    app.use("/api", authRoutes);

    // Test route
    const testRoutes = require("./routes/test.route.js");
    app.use("/", testRoutes);

    // Protected route
    const protectedRoutes = require("./routes/protected.route.js");
    app.use("/api/protected", protectedRoutes);

    // Assets routes
    const assetsRoutes = require("./routes/assets.route");
    app.use("/api/assets", assetsRoutes);

    // Requests routes
    const requestsRoutes = require("./routes/requests.route");
    app.use("/api/requests", requestsRoutes);

    // Assigned assets
    const assignedAssetsRoutes = require("./routes/assignedAssets.route");
    app.use("/api/assigned-assets", assignedAssetsRoutes);

    // Affiliations routes
    const affiliationsRoutes = require("./routes/affiliations.route");
    app.use("/api/affiliations", affiliationsRoutes);

    // Packages routes
    const packagesRoutes = require("./routes/packages.route");
    app.use("/api/packages", packagesRoutes);

    // Payments (checkout, history, simulate)
    app.use("/api/payments", paymentsRouter);

    // START SERVER
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`AssetVerse Backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB connect error", err);
  });
