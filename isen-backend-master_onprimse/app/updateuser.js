const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust the path to your User model if needed
require('dotenv').config(); // Load environment variables from .env file, if available
const bcrypt = require('bcrypt');

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
const db = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Update all users' passwords to '123456789', hash them using bcrypt, and ensure they are enabled
const updateUserPasswordsAndEnableUsers = async () => {
  try {
    const users = await User.find({});

    for (const user of users) {
      console.log(`Updating password and enabling user: ${user.email}`);

      // Set the plain text password to '123456789'
      const plainPassword = '123456789';

      // Re-hash the password using bcrypt
      const salt = await bcrypt.genSalt(10);
      const newHashedPassword = await bcrypt.hash(plainPassword, salt);

      // Update user with new bcrypt hashed password, salt, and ensure the user is enabled
      user.hashed_password = newHashedPassword;
      user.salt = salt;
      user.enabled = true; // Set enabled to true to ensure the user is active

      // Save the updated user
      await user.save();
      console.log(`Password updated and user enabled: ${user.email}`);
    }

    console.log('All user passwords updated and users enabled.');
  } catch (error) {
    console.error('Error updating passwords and enabling users:', error.message);
  } finally {
    mongoose.connection.close(); // Close the mongoose connection
  }
};

// Call the function to update user passwords and enable them
updateUserPasswordsAndEnableUsers();
