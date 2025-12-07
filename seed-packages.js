// seed-packages.js
require("dotenv").config();
const { MongoClient } = require("mongodb");

async function seedPackages() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "assetverse";

  if (!uri) {
    console.error(" MONGO_URI not found in .env");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const packagesColl = db.collection("packages");

    // Clear old packages (optional)
    await packagesColl.deleteMany({});
    console.log(" Old packages cleared");

    const seedData = [
      {
        name: "Basic",
        employeeLimit: 5,
        price: 5,
        features: ["Asset Tracking", "Employee Management", "Basic Support"],
      },
      {
        name: "Standard",
        employeeLimit: 10,
        price: 8,
        features: ["All Basic features", "Advanced Analytics", "Priority Support"],
      },
      {
        name: "Premium",
        employeeLimit: 20,
        price: 15,
        features: ["All Standard features", "Custom Branding", "24/7 Support"],
      },
    ];

    const result = await packagesColl.insertMany(seedData);
    console.log(` Seeded ${result.insertedCount} packages successfully`);

    console.log(" Packages seeding complete!");
    process.exit(0);
  } catch (err) {
    console.error(" Error seeding packages:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedPackages();
