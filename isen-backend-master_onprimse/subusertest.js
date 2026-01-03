const mongoose = require("mongoose");
const User = require("./app/models/User");
const Subscription = require("./app/models/Subscription");
require("dotenv").config();

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
const db =
  process.env.MONGODB_URL ||
  "mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";

// Helper to log subscription and user for debugging
const logSubscriptionAndUser = async (userId, subscriptionId) => {
  try {
    const user = await User.findById(userId).lean();
    const subscription = await Subscription.findById(subscriptionId).lean();

    console.log("User Document:", user);
    console.log("Subscription Document:", subscription);

    if (!user) {
      console.error(`User with ID ${userId} not found.`);
    }

    if (!subscription) {
      console.error(`Subscription with ID ${subscriptionId} not found.`);
    }
  } catch (err) {
    console.error("Error logging subscription and user:", err);
  }
};

const subscribeUser = async () => {
  console.log("Starting subscription process...");

  try {
    // Set user ID and subscription ID
    const userId = "66c7ba8cb077a84040bd9eff";
    const subscriptionId = "671bff036b3d9732cc01db69";

    // Log the user and subscription details
    await logSubscriptionAndUser(userId, subscriptionId);

    // Calculate expiration date (one month from now)
    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 1);

    // Update the user's subscription
    const result = await User.updateOne(
      { _id: userId },
      {
        $set: {
          subscription: {
            _id: subscriptionId,
            expireDate: expireDate,
          },
        },
      }
    );

    if (result.nModified === 1) {
      console.log(
        `User ${userId} successfully subscribed to ${subscriptionId} for one month.`
      );
    } else {
      console.log(
        `No updates made. User ${userId} may not exist or is already subscribed.`
      );
    }
  } catch (err) {
    console.error("Error subscribing user:", err.message);
  } finally {
    mongoose.connection.close();
  }
};

// Connect to MongoDB and run the subscription function
mongoose
  .connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to MongoDB");
    subscribeUser();
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err.message));
