const mongoose = require('mongoose');
const User = require("./app/models/User");
require('dotenv').config(); // Load environment variables from .env file, if available

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

const db = process.env.MONGODB_URL;

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
mongoose.connect(db)
  .then(() => {
    console.log('Connected to MongoDB');
    resetAllFollowedChannels();
  })
  .catch(err => console.error('Error connecting to MongoDB:', err.message));
