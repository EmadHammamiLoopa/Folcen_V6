// Reset friendship between two test users
// Usage: run from backend folder: node ..\.tmp_auth_test_run\reset_friendship.js

const mongoose = require('mongoose');
const path = require('path');

const MONGO_URI = 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected');

    const User = require(path.join(__dirname, '..', 'isen-backend-master_onprimse', 'app', 'models', 'User'));
    const Request = require(path.join(__dirname, '..', 'isen-backend-master_onprimse', 'app', 'models', 'Request'));

    const A = '66c7ba8cb077a84040bd9f01';
    const B = '66c7ba8cb077a84040bd9eed';

    console.log('Removing friendship relations...');
    const r1 = await User.updateOne({ _id: A }, { $pull: { friends: mongoose.Types.ObjectId(B) } });
    const r2 = await User.updateOne({ _id: B }, { $pull: { friends: mongoose.Types.ObjectId(A) } });

    console.log('User update results:', r1, r2);

    try {
      // Attempt to remove any Request documents between them (best-effort)
      const del = await Request.deleteMany({ $or: [ { user: A, receiver: B }, { user: B, receiver: A }, { user: A }, { user: B }, { receiver: A }, { receiver: B } ] });
      console.log('Deleted Requests matching either user:', del.deletedCount);
    } catch (e) {
      console.warn('Could not delete Request documents (model may differ):', e.message);
    }

    // Verify
    const a = await User.findById(A).select('friends').lean();
    const b = await User.findById(B).select('friends').lean();

    console.log('A.friends contains B?', a && a.friends && a.friends.map(String).includes(B));
    console.log('B.friends contains A?', b && b.friends && b.friends.map(String).includes(A));

    console.log('Done. Disconnecting.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    try { await mongoose.disconnect(); } catch(e){}
    process.exit(2);
  }
}

run();
