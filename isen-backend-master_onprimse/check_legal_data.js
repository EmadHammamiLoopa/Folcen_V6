
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const LegalAcceptance = require('./app/models/LegalAcceptance');

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/isen');
        const userId = '6949d6df16db3452c1211539';
        const records = await LegalAcceptance.find({ userId }).lean();
        console.log('RECORDS FOR USER:', userId);
        console.log(JSON.stringify(records, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkData();
