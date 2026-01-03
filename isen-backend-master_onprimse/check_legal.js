const mongoose = require('mongoose');
const LegalAcceptance = require('./app/models/LegalAcceptance');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/isen');
    const count = await LegalAcceptance.countDocuments();
    console.log('Total records:', count);
    const latest = await LegalAcceptance.find().sort({ _id: -1 }).limit(10).lean();
    console.log('Latest records:', JSON.stringify(latest, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
