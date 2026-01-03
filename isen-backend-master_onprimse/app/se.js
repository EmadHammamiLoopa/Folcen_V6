const mongoose = require('mongoose');
const Channel = require('./models/Channel'); // Adjust the path based on your project structure
const User = require('./models/User'); // Adjust the path based on your project structure

// MongoDB connection URL (replace with your actual URL or use environment variable)
const db = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB Connected');
    resetStaticChannels(); // Call function to reset static channels after successful connection
  })
  .catch(err => console.log(err));

// Function to reset existing static, static_events, and static_dating channels
async function resetStaticChannels() {
  try {
    // Define the criteria for the static channels you want to reset
    const staticChannelTypes = ['static', 'static_events', 'static_dating'];

    // Fetch all static channels
    const staticChannels = await Channel.find({ type: { $in: staticChannelTypes } });

    // Reset static channels (for this, I will assume "reset" means removing followers and resetting any custom fields)
    for (const channel of staticChannels) {
      console.log(`Resetting channel: ${channel.name}`);
      
      // Optionally reset any fields in the static channels here
      channel.followers = []; // Reset followers
      
      // Save the updated channel
      await channel.save();
    }

    console.log('Static channels have been reset successfully.');
  } catch (error) {
    console.error('Error resetting static channels:', error);
  } finally {
    // Close the database connection after the reset
    mongoose.connection.close();
  }
}
