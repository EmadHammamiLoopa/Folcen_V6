require('dotenv').config({ path: '../.env' }); // Adjust if your script is in a subdirectory
const mongoose = require('mongoose');
const User = require('./models/User'); // Ensure this path matches where your User model is located

mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB...'))
.catch((err) => console.error('Could not connect to MongoDB:', err));

User.find({}).select('email hashed_password').exec((err, users) => {
  if (err) {
    console.error('Error fetching users:', err);
  } else {
    users.forEach(user => {
      console.log(`Email: ${user.email}, Hashed Password: ${user.hashed_password}`);
    });
  }
  mongoose.connection.close(); // Ensure you close the connection after the operation
});
