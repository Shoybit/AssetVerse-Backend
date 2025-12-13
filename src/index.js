require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const {
  paymentsRouter,
  stripeWebhookHandler,
} = require("./routes/payments.route");

const app = express();

/* -------------------------------------------------
   STRIPE WEBHOOK (MUST BE FIRST, RAW BODY)
------------------------------------------------- */
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

/* -------------------------------------------------
   NORMAL MIDDLEWARES (AFTER WEBHOOK)
------------------------------------------------- */
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

/* -------------------------------------------------
   CONNECT DATABASE & ROUTES
------------------------------------------------- */
connectDB()
  .then(() => {
    // Auth
    app.use("/api", require("./routes/auth.route"));

    // Test
    app.use("/", require("./routes/test.route"));

    // Protected
    app.use("/api/protected", require("./routes/protected.route"));

    // Assets
    app.use("/api/assets", require("./routes/assets.route"));

    // Requests
    app.use("/api/requests", require("./routes/requests.route"));

    // Assigned assets
    app.use("/api/assigned-assets", require("./routes/assignedAssets.route"));

    // Affiliations
    app.use("/api/affiliations", require("./routes/affiliations.route"));

    // Packages
    app.use("/api/packages", require("./routes/packages.route"));

    // Payments
    app.use("/api/payments", paymentsRouter);

    // Users (profile update)
    app.use("/api", require("./routes/users.route"));

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`AssetVerse Backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB connect error", err);
  });
