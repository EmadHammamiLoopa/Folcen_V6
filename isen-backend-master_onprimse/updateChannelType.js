const mongoose = require('mongoose');
const User = require("./app/models/User");
require('dotenv').config(); // Load environment variables from .env file, if available

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
const db = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

// Function to reset followed channels for all users
const resetAllFollowedChannels = async () => {
  try {
    // Set followedChannels array to an empty array for all users
    const result = await User.updateMany({}, { $set: { followedChannels: [] } });
    console.log(`Reset followed channels for ${result.nModified} users.`);
  } catch (err) {
    console.error('Error resetting followed channels:', err.message);
  } finally {
    mongoose.connection.close();
  }
};

// Connect to MongoDB and run the reset function
mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    resetAllFollowedChannels();
  })
  .catch(err => console.error('Error connecting to MongoDB:', err.message));
