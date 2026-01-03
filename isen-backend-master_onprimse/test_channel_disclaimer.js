
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./app/models/User');
const Channel = require('./app/models/Channel');
const LegalAcceptance = require('./app/models/LegalAcceptance');
const { recordAcceptance } = require('./app/utils/legalAccept');

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/isen');
        console.log('Connected to MongoDB');

        const userId = '6949d6df16db3452c1211539';
        const user = await User.findById(userId);

        if (!user) {
            console.log('User not found');
            return;
        }

        console.log(`Testing for user: ${user.username} (${user._id})`);

        // Check if user has channels
        const channels = await Channel.find({ user: userId });
        console.log(`User has ${channels.length} channels.`);

        // Check for disclaimers
        const acceptances = await LegalAcceptance.find({ userId, documentType: 'channels_disclaimer' });
        console.log(`User has ${acceptances.length} channel disclaimer records.`);

        if (channels.length > 0 && acceptances.length === 0) {
            console.log('User has channels but NO disclaimer record. This is a legacy user.');
            
            // Simulate what the middleware would do now if they tried to create another channel
            console.log('Simulating auto-recording of disclaimer...');
            
            await recordAcceptance({
                user: user,
                documentType: 'channels_disclaimer',
                documentVersion: process.env.CHANNELS_DISCLAIMER_VERSION || '1.0.0',
                acceptanceContext: 'test_fix_legacy',
                meta: { clientType: 'test_script', note: 'Backfilled for legacy channel owner' },
                ip: '127.0.0.1',
                userAgent: 'TestScript/1.0'
            });

            console.log('✅ Disclaimer recorded successfully.');
            
            const newAcceptances = await LegalAcceptance.find({ userId, documentType: 'channels_disclaimer' });
            console.log(`User now has ${newAcceptances.length} channel disclaimer records.`);
        } else {
            console.log('User already has disclaimer or no channels.');
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
