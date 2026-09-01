const mongoose = require('mongoose');

// MongoDB Connection
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

mongoose.connect(process.env.MONGODB_URL)
.then(() => {
    console.log('✅ Connected to MongoDB successfully.');
    deleteAllReports(); // Call delete function after successful connection
})
.catch(err => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
});

// Define Report Schema (simplified for deletion)
const reportSchema = new mongoose.Schema({}, { strict: false });
const Report = mongoose.model('Report', reportSchema, 'reports'); // Explicitly define collection name

// Function to Delete All Reports
async function deleteAllReports() {
    try {
        const result = await Report.deleteMany({}); // Deletes all documents in the collection
        console.log(`🗑️ Deleted ${result.deletedCount} reports successfully.`);
    } catch (err) {
        console.error('❌ Error deleting reports:', err);
    } finally {
        mongoose.connection.close(); // Close connection when done
        console.log('🔌 MongoDB connection closed.');
    }
}
