const mongoose = require('mongoose');
const User = require('../app/models/User');
require('dotenv').config();

const A = '66c7ba8cb077a84040bd9f01';
const B = '66c7ba8cb077a84040bd9eed';

async function main(){
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

  const uri = process.env.MONGODB_URL;
  await mongoose.connect(uri);
  console.log('Connected to DB');
  try{
    const ua = await User.findById(A);
    const ub = await User.findById(B);
    if(!ua || !ub){
      console.log('One of users not found', !!ua, !!ub);
      return process.exit(1);
    }
    ua.friends = (ua.friends || []).filter(f => String(f) !== B);
    ub.friends = (ub.friends || []).filter(f => String(f) !== A);
    await ua.save();
    await ub.save();
    console.log('Friendship removed between', A, 'and', B);
    process.exit(0);
  }catch(e){
    console.error('Error:', e);
    process.exit(2);
  }
}

main();
