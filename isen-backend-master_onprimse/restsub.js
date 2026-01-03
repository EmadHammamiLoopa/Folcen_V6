const mongoose = require('mongoose');
const User = require('./app/models/User'); // Adjust the path to your User model
const Subscription = require('./app/models/Subscription'); // Adjust the path to your Subscription model
require('dotenv').config(); // Load environment variables from .env file

// Connect to the MongoDB database
mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const resetAllSubscriptions = async () => {
  try {
    console.log('Connecting to the database...');
    await mongoose.connection.once('open', () => {
      console.log('Connected to the database');
    });

    // Remove all user-specific subscriptions from users
    const users = await User.find({});

    for (let user of users) {
      user.subscription = null; // Clear the subscription field
      await user.save();
      console.log(`Subscription reset for user ${user._id}`);
    }

    // Optionally, clear out all subscriptions from the Subscription collection
    await Subscription.deleteMany({});
    console.log('All subscriptions have been deleted.');

    console.log('Subscription reset completed for all users.');
    mongoose.connection.close();
  } catch (error) {
    console.error('Error resetting subscriptions:', error);
    mongoose.connection.close();
  }
};

resetAllSubscriptions();
