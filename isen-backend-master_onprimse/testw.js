const mongoose = require('mongoose');
const User = require("./app/models/User");
require('dotenv').config(); // Load environment variables from .env file, if available

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

const db = process.env.MONGODB_URL;

// Function to update mainAvatar and avatar URLs for all users back to localhost
const revertAvatarsForAllUsers = async () => {
  try {
    // Find and update users who have avatars starting with "https://project-9aw8.onrender.com/"
    const result = await User.updateMany(
      {
        $or: [
          { mainAvatar: { $regex: '^https://project-9aw8.onrender.com/' } }, // Check for mainAvatar field
          { 'avatar.0': { $exists: true, $regex: '^https://project-9aw8.onrender.com/' } } // Check if avatar array exists and matches
        ]
      },
      [
        {
          $set: {
            mainAvatar: {
              $replaceOne: {
                input: "$mainAvatar",
                find: "https://project-9aw8.onrender.com/",
                replacement: "http://127.0.0.1:3300/"
              }
            },
            avatar: {
              $map: {
                input: "$avatar",
                as: "item",
                in: {
                  $replaceOne: {
                    input: "$$item",
                    find: "https://project-9aw8.onrender.com/",
                    replacement: "http://127.0.0.1:3300/"
                  }
                }
              }
            }
          }
        }
      ]
    );

    console.log(`Reverted avatars for ${result.modifiedCount} users.`);
  } catch (err) {
    console.error('Error reverting avatars:', err.message);
  } finally {
    mongoose.connection.close();
  }
};

// Connect to MongoDB and run the revert function
mongoose.connect(db)
  .then(() => {
    console.log('Connected to MongoDB');
    revertAvatarsForAllUsers();
  })
  .catch(err => console.error('Error connecting to MongoDB:', err.message));
