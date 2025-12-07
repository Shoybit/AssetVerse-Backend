require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB Native Driver
connectDB();

// Routes
const testRoutes = require("./routes/test.route");
app.use("/", testRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`AssetVerse Backend running on port ${PORT}`));
