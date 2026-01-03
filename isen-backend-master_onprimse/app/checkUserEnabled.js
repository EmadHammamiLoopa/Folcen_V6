const mongoose = require('mongoose');
const User = require('./models/User'); // Adjusted as per your given path

// Your MongoDB connection string
const db = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/?retryWrites=true&w=majority';

mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Function to check if a user is enabled
const checkUserEnabled = async () => {
    try {
        // Adjust the email as needed
        const emailToCheck = "admin@example.com";
        const user = await User.findOne({ email: emailToCheck }, 'enabled');

        if (user) {
            console.log(`Enabled field for ${emailToCheck}:`, user.enabled);
        } else {
            console.log(`User with email ${emailToCheck} not found.`);
        }
    } catch (err) {
        console.error('Error finding user:', err);
    } finally {
        // Close the Mongoose connection
        mongoose.connection.close();
    }
};

// Execute the function
checkUserEnabled();
