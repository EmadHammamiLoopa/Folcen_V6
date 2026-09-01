const mongoose = require('mongoose');
require('dotenv').config(); // To load environment variables from a .env file

// Import the Message and User models
const Message = require('./app/models/Message'); // Adjust the path to your Message model
const User = require('./app/models/User'); // Adjust the path to your User model

// Connect to the MongoDB database
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

mongoose.connect(process.env.MONGODB_URL);

const resetMessagesAndUsers = async () => {
  try {
    console.log('Connecting to the database...');
    await mongoose.connection.once('open', () => {
      console.log('Connected to the database');
    });

    // Remove all messages from the Message collection
    const messageDeleteResult = await Message.deleteMany({});
    console.log(`Deleted ${messageDeleteResult.deletedCount} messages from the database.`);

    // Reset the messages field and messagedUsers field in all User documents
    const userUpdateResult = await User.updateMany(
      {},
      { 
        $set: { 
          messages: [], // Reset the messages field
          messagedUsers: [] // Reset the messagedUsers field
        }
      }
    );
    console.log(`Updated ${userUpdateResult.modifiedCount} user documents.`);

    // Optional: Verify changes
    const updatedUsers = await User.find({}, { messages: 1, messagedUsers: 1 });
    console.log('Updated user documents:', updatedUsers);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error resetting messages and users:', error);
    mongoose.connection.close();
  }
};

resetMessagesAndUsers();
