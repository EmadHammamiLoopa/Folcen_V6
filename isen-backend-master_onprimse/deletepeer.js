const mongoose = require("mongoose");
require("dotenv").config();

const Peer = require("./app/models/Peer");

const db =
  process.env.MONGODB_URL ||
  "mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(db, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ Connected to MongoDB");

    const result = await Peer.deleteMany({});

    console.log(`🗑️ Deleted ${result.deletedCount} peer(s)`);

    mongoose.disconnect();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });
