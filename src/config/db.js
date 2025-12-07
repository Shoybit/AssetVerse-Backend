// src/config/db.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

let db;
let client;

async function connectDB() {
  try {
    client = new MongoClient(process.env.MONGO_URI); 
    await client.connect();
    db = client.db(process.env.DB_NAME || 'assetverse');

    // Ensure common indexes (idempotent)
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('assets').createIndex({ hrEmail: 1 });
    await db.collection('assets').createIndex({ companyName: 1 });
    await db.collection('requests').createIndex({ requesterEmail: 1 });
    // employeeAffiliations compound unique index (ignore error if already exists)
    await db.collection('employeeAffiliations').createIndex(
      { employeeEmail: 1, hrEmail: 1 },
      { unique: true }
    ).catch(() => {});

    console.log('MongoDB (Native Driver) Connected Successfully');
    return db;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
}

function getClient() {
  if (!client) throw new Error('MongoClient not initialized. Call connectDB() first.');
  return client;
}

async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connectDB, getDB, getClient, closeDB };
