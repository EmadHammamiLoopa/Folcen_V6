const mongoose = require('mongoose');
const User = require('./app/models/User'); // Adjust path to your User model
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
require('dotenv').config(); // To load environment variables from a .env file

const defaultMaleAvatarUrl = '/images/avatars/male.webp';
const defaultFemaleAvatarUrl = '/images/avatars/female.webp';
const defaultOtherAvatarUrl = '/images/avatars/other.webp';

// Connect to the MongoDB database
mongoose.connect(process.env.MONGODB_URL);

const cleanUpAvatars = async () => {
  try {
    console.log('Connecting to the database...');
    await mongoose.connection.once('open', () => {
      console.log('Connected to the database');
    });

    const users = await User.find({});

    for (let user of users) {
      const cleanedAvatars = [];
      for (const url of user.avatar) {
        const avatarPath = path.join(__dirname, 'public', url);
        try {
          await fsp.access(avatarPath);
          cleanedAvatars.push(url);
        } catch (e) {
          console.log(`File not found: ${avatarPath}`);
        }
      }

      if (cleanedAvatars.length === 0) {
        cleanedAvatars.push(user.gender === 'male' ? defaultMaleAvatarUrl : (user.gender === 'female' ? defaultFemaleAvatarUrl : defaultOtherAvatarUrl));
      }

      user.avatar = cleanedAvatars;
      await user.save();
      console.log(`Cleaned avatars for user ${user._id}`);
    }

    console.log('Avatar cleanup completed.');
  mongoose.connection.close();
  } catch (error) {
    console.error('Error cleaning up avatars:', error);
    mongoose.connection.close();
  }
};

cleanUpAvatars();
