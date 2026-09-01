const mongoose = require('mongoose');
const User = require('./app/models/User');
require('dotenv').config();

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/isen';

mongoose.connect(MONGODB_URL).then(async () => {
    console.log('Connected to MongoDB');

    const oldDefaults = [
        'male.webp', 'female.webp', 'other.webp',
        '/public/images/avatars/male.webp',
        '/public/images/avatars/female.webp',
        '/public/images/avatars/other.webp'
    ];

    const users = await User.find({
        $or: [
            { mainAvatar: { $regex: oldDefaults.join('|') } },
            { mainAvatar: { $exists: false } },
            { mainAvatar: null },
            { avatar: { $elemMatch: { $regex: oldDefaults.join('|') } } }
        ]
    });

    console.log(`Found ${users.length} users to migrate`);

    for (const user of users) {
        console.log(`Migrating user: ${user.email}`);
        
        // The pre('save') hook we added will handle the logic
        // We just need to trigger a save.
        // But let's be explicit just in case.
        
        const isOldDefault = (p) => {
            if (!p || typeof p !== 'string') return false;
            return oldDefaults.some(d => p.includes(d));
        };

        if (!user.mainAvatar || isOldDefault(user.mainAvatar)) {
            user.mainAvatar = user.getDefaultAvatar();
        }

        if (user.avatar && Array.isArray(user.avatar)) {
            user.avatar = user.avatar.filter(a => !isOldDefault(a));
            if (user.avatar.length === 0 && user.mainAvatar) {
                user.avatar = [user.mainAvatar];
            }
        } else {
            user.avatar = [user.mainAvatar];
        }

        await user.save();
    }

    console.log('Migration completed');
    process.exit(0);
}).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
