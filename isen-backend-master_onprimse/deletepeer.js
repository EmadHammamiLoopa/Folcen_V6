const mongoose = require("mongoose");
require("dotenv").config();

const Peer = require("./app/models/Peer");

if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

const db = process.env.MONGODB_URL;

mongoose
  .connect(db)
  .then(async () => {
    console.log("✅ Connected to MongoDB");

    const result = await Peer.deleteMany({});

    console.log(`🗑️ Deleted ${result.deletedCount} peer(s)`);

    mongoose.disconnect();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });
