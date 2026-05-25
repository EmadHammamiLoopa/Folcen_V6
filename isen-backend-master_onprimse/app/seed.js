const mongoose = require('mongoose');
const User = require('./models/User'); // Ensure the path is correct based on your project structure
require('dotenv').config(); // Load environment variables from .env file, if available

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
const db = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Upsert a user: update if email exists, create if not (preserves existing accounts)
const createUser = async (userData) => {
  try {
    const { password, ...rest } = userData;
    const existing = await User.findOne({ email: rest.email });
    if (existing) {
      console.log(`User ${userData.email} already exists, skipping`);
      return;
    }
    const user = new User(userData);
    await user.save();
    console.log(`User ${userData.email} created successfully`);
  } catch (error) {
    console.error(`Error creating user ${userData.email}:`, error.message);
  }
};

// Create users
const createUsers = async () => {
  const userPromises = [];

  // Create a SUPER ADMIN user
  userPromises.push(createUser({
    firstName: 'Super',
    lastName: 'Admin',
    email: 'superadmin@example.com', // Use your desired super admin email
    password: 'superadmin123', // Use your desired password
    gender: 'male',
    role: 'SUPER ADMIN', // Super Admin role
    // Add any other fields your User model requires
  }));

  // Create an admin user
  userPromises.push(createUser({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com', // Use your desired initial admin email
    password: 'admin123', // Use your desired password
    gender: 'male',
    role: 'ADMIN', // Admin role
    // Add any other fields your User model requires
  }));

  // Create a SYSTEM user
userPromises.push(createUser({
  firstName: 'System',
  lastName: 'User',
  email: 'folcenteam@gmail.com', // Use this email for the system user
  password: 'system123', // Set a password or leave empty if not needed
  gender: 'male',
  role: 'ADMIN', // You can set this to 'ADMIN' or any other appropriate role
}));


  // Create 30 regular users
  for (let i = 1; i <= 30; i++) {
    const userData = {
      firstName: `User${i}`,
      lastName: `Last${i}`,
      email: `user${i}@example.com`,
      password: `password${i}`,
      country: `Norway`,
      city: `Oslo`,
      gender: i % 2 === 0 ? 'male' : 'female',
      role: 'USER', // Regular user role
      // Add any other fields your User model requires
    };
    userPromises.push(createUser(userData));
  }

  await Promise.all(userPromises);
  console.log('All users created successfully');

  // Close the mongoose connection
  mongoose.connection.close();
};

// Create seed users (skips any that already exist)
const resetAndCreateUsers = async () => {
  await createUsers();
};

// Connect to MongoDB and call resetAndCreateUsers function
mongoose.connect(db, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
  resetAndCreateUsers();
}).catch(error => {
  console.error('Error connecting to MongoDB:', error.message);
});
