const mongoose = require('mongoose');

// MongoDB connection
mongoose.connect('mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('Connected to MongoDB successfully.');
    updateChannelType(); // Call the update function once connected
})
.catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
});

// Channel Schema (simplified for the script)
const channelSchema = new mongoose.Schema({
    type: String
});

const Channel = mongoose.model('Channel', channelSchema);

// Function to update incorrect "static_envents" to "static_events"
async function updateChannelType() {
    try {
        const result = await Channel.updateMany(
            { type: 'static_envents' }, // Filter documents with incorrect type
            { $set: { type: 'static_events' } } // Update to the correct value
        );

        console.log(`${result.nModified} document(s) updated successfully.`);
    } catch (err) {
        console.error('Error updating channel types:', err);
    } finally {
        mongoose.connection.close(); // Close the connection when done
    }
}
