const Comment = require("./models/Comment");
const Follow = require("./models/Follow");
const Job = require("./models/Job");
const Message = require("./models/Message");
const Post = require("./models/Post");
const Product = require("./models/Product");
const Report = require("./models/Report");
const Request = require("./models/Request");
const Service = require("./models/Service");
const User = require("./models/User");

module.exports = (agenda) => {
    // Define the "expired subscription" task
    agenda.define("expired subscription", async () => {
        const date = new Date();
        try {
            const result = await User.updateMany({
                "subscription.expireDate": { $lt: date }
            }, {
                $set: { subscription: null }
            });
            console.log(`${result.nModified} expired subscriptions updated.`);
        } catch (err) {
            console.error('Error updating expired subscriptions:', err);
        }
    });

    // Define the "delete users" task
    agenda.define("delete users", async () => {
        const date = new Date();
        date.setTime(date.getTime() - 4 * 24 * 60 * 60 * 1000); // 4 days

        try {
            const users = await User.find({
                deletedAt: { $ne: null, $lt: date }
            });

            // Delete users concurrently
            await Promise.all(users.map(user => deleteUser(user)));
            console.log(`Deleted ${users.length} users and their related data.`);
        } catch (err) {
            console.error('Error finding users to delete:', err);
        }
    });

    // Function to delete a user and all related data
    const deleteUser = async (user) => {
        try {
            await Promise.all([
                Post.deleteMany({ user: user._id }),
                Comment.deleteMany({ user: user._id }),
                Job.deleteMany({ user: user._id }),
                Product.deleteMany({ user: user._id }),
                Service.deleteMany({ user: user._id }),
                Report.deleteMany({ user: user._id }),
                Request.deleteMany({ $or: [{ from: user._id }, { to: user._id }] }),
                Follow.deleteMany({ $or: [{ from: user._id }, { to: user._id }] }),
                Message.deleteMany({ $or: [{ from: user._id }, { to: user._id }] }),
                user.deleteOne()
            ]);

            console.log(`User ${user._id} and related data deleted.`);
        } catch (err) {
            console.error(`Error deleting user ${user._id}:`, err);
        }
    };

    // Define the "clean database" task
    agenda.define("clean database", async () => {
        console.log('Cleaning database...');

        try {
            const orphanedResources = [
                { model: Post, name: 'posts' },
                { model: Comment, name: 'comments' },
                { model: Product, name: 'products' },
                { model: Job, name: 'jobs' },
                { model: Service, name: 'services' }
            ];

            for (const resource of orphanedResources) {
                const docs = await resource.model.find({}).populate('user', '_id').select('user');
                const deletedDocs = docs.filter(doc => !doc.user);
                await Promise.all(deletedDocs.map(doc => doc.deleteOne()));

                console.log(`${deletedDocs.length} orphaned ${resource.name} cleaned.`);
            }

            console.log('Database cleaned successfully.');
        } catch (err) {
            console.error('Error cleaning database:', err);
        }
    });

    // Start the agenda and schedule jobs
    (async () => {
        await agenda.start();
        await agenda.every("12 hours", "expired subscription");  // Adjusted frequency to 12 hours
        await agenda.every("24 hours", "delete users");          // Adjusted to run daily
        await agenda.every("24 hours", "clean database");        // Adjusted to run daily
    })();
};
