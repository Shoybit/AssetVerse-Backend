const { MongoClient } = require("mongodb");
require("dotenv").config();

let db;

async function connectDB() {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db(process.env.DB_NAME);

    console.log("MongoDB (Native Driver) Connected Successfully");
    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}

module.exports = { connectDB, getDB };
