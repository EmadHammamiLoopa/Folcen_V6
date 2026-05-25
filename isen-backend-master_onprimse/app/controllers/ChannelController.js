const mongoose = require("mongoose")
const Channel = require("../models/Channel")
const Response = require("./Response")
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { extractDashParams, report, sendNotification } = require("../helpers")
const _ = require('lodash')
const Report = require("../models/Report")
const Post = require("../models/Post");
const { destroyPost } = require("./PostController")
const User = require("../models/User")
const Comment = require("../models/Comment")





const storeChannelPhoto = async (req, channel) => {
    try {
        let photo = req.files.photo || req.files.image || req.files.upload;
        
        if (Array.isArray(photo)) {
            photo = photo[0];
        }

        if (photo && (photo.path || photo.filepath)) {
            const tempPath = photo.path || photo.filepath;
            const photoName = `${channel._id}.png`;
            const photoPath = path.join(__dirname, `./../../public/channels/${photoName}`);
            const dir = path.dirname(photoPath);
            
            await fsp.mkdir(dir, { recursive: true });
            await fsp.copyFile(tempPath, photoPath);
            
            if (!channel.photo || typeof channel.photo !== 'object') {
                channel.photo = {};
            }
            channel.photo.path = `/channels/${photoName}`;
            channel.photo.format = 'png';
        } else if (req.fields.photo && typeof req.fields.photo === 'string' && req.fields.photo.startsWith('data:image')) {
            const base64Data = req.fields.photo.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const photoName = `${channel._id}.png`;
            const photoPath = path.join(__dirname, `./../../public/channels/${photoName}`);
            const dir = path.dirname(photoPath);
            await fsp.mkdir(dir, { recursive: true });
            await fsp.writeFile(photoPath, buffer);
            
            if (!channel.photo || typeof channel.photo !== 'object') {
                channel.photo = {};
            }
            channel.photo.path = `/channels/${photoName}`;
            channel.photo.format = 'png';
        } else {
            if (!channel.photo || typeof channel.photo !== 'object') {
                channel.photo = {};
            }
            channel.photo.path = '/channels/channel-default.png';
            channel.photo.format = 'png';
        }
    } catch (err) {
        console.error("Error in storeChannelPhoto:", err);
        if (!channel.photo || typeof channel.photo !== 'object') {
            channel.photo = {};
        }
        channel.photo.path = '/channels/channel-default.png';
        channel.photo.format = 'png';
    }
}


exports.reportChannel = async (req, res) => {
    try {
        const channel = req.channel;

        const reportData = await report(req, res, 'Channel', channel._id);
        if (!reportData || res.headersSent) return;

        await Channel.updateOne({ _id: channel._id }, { $push: { reports: reportData._id } });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Server error');
        }
    }
};


exports.clearChannelReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.channel._id,
            "entity.name": "channel"
        });

        return Response.sendResponse(res, null, "reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
    }
};


exports.toggleChannelStatus = async (req, res) => {
    try {
        const channel = req.channel;
        channel.enabled = !channel.enabled;
        await channel.save();

        return Response.sendResponse(res, channel);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to update channel status');
    }
};


exports.toggleChannelApprovement = async (req, res) => {
    try {
        const channel = req.channel;
        channel.approved = !channel.approved;
        await channel.save();

        return Response.sendResponse(res, channel);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to update channel approval');
    }
};

exports.showChannel = async (req, res) => {
    try {
        const channel = await Channel.findOne({ _id: req.channel._id })
            .populate({ path: 'user', select: 'firstName lastName email mainAvatar avatarStyle avatarSeed avatarOverrides role' })
            .populate({ path: 'reports', model: 'Report' });

        if (!channel) {
            return Response.sendError(res, 404, 'Channel not found');
        }

        // Get recent posts for this channel
        const posts = await Post.find({ channel: channel._id })
            .populate({ path: 'user', select: 'firstName lastName email avatar mainAvatar' })
            .sort({ createdAt: -1 })
            .limit(20);

        // Calculate total comments on all channel posts
        const allPostIds = await Post.find({ channel: channel._id }).distinct('_id');
        const totalComments = await Comment.countDocuments({ post: { $in: allPostIds } });

        return Response.sendResponse(res, {
            channel,
            posts,
            counts: {
                followers: channel.followers ? channel.followers.length : 0,
                posts: allPostIds.length,
                reports: channel.reports ? channel.reports.length : 0,
                totalComments: totalComments
            }
        });
    } catch (err) {
        console.error("Error showing channel:", err);
        return Response.sendError(res, 500, 'Failed to retrieve channel');
    }
};
exports.showChannelEditDash = async (req, res) => {
    try {
        const channel = await Channel.findById(req.channel._id);
        if (!channel) return Response.sendError(res, 404, 'Channel not found');
        
        const channelData = channel.toObject();
        channelData.id = channel._id;
        
        return Response.sendResponse(res, channelData);
    } catch (err) {
        console.error("Error in showChannelEditDash:", err);
        return Response.sendError(res, 500, "Server error");
    }
};

exports.allChannels = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['name', 'description', 'country', 'city']);

        const channels = await Channel.aggregate()
            .match(dashParams.filter)
            .lookup({
                from: 'posts',
                localField: '_id',
                foreignField: 'channel',
                as: 'posts'
            })
            .project({
                _id: 1,
                name: 1,
                description: 1,
                approved: 1,
                city: 1,
                country: 1,
                photo: "$photo.path",
                enabled: 1,
                reports: { $size: { $ifNull: ["$reports", []] } },
                followers: { $size: { $ifNull: ["$followers", []] } },
                postsCount: { $size: "$posts" }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const count = await Channel.find(dashParams.filter).countDocuments();

        return Response.sendResponse(res, {
            docs: channels,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};


exports.exploreChannels = async (req, res) => {
    try {
        const limit = 20;
        const userId = new mongoose.Types.ObjectId(req.auth._id);
        const { level = 'city', search = '', page = 0, category = '' } = req.query || {};

        let filter = {
            followers: { $ne: userId },
            name: new RegExp('^' + search, 'i'),
            user: { $ne: userId },
            deletedAt: null,
            enabled: true,
            approved: true,
            type: 'user' // Only explore user-created channels here
        };

        if (category && category.trim() !== '') {
            filter.category = new RegExp('^' + category, 'i');
        }

        let message = '';
        let promptFor = '';

        // Determine the filter based on the level
        if (level === 'city') {
            filter.city = req.authUser.city;
            message = "No channels found in your city. Would you like to explore channels in your country?";
            promptFor = 'country';
        } else if (level === 'country') {
            filter.country = req.authUser.country;
            message = "No channels found in your country. Would you like to explore channels around the world?";
            promptFor = 'global';
        } else {
            // Global level, no location filter
            message = "No channels found around the world.";
        }

        // Fetch channels based on the filter
        let channels = await Channel.find(filter)
            .select('name description photo user followers approved type category city country createdAt')
            .populate({ path: 'user', select: 'name email avatar' })
            .skip(limit * page)
            .limit(limit);

        // If channels are found, return them
        if (channels.length > 0) {
            const count = await Channel.find(filter).countDocuments();
            return Response.sendResponse(res, {
                channels,
                more: (count - (limit * (+page + 1))) > 0
            });
        } else {
            // No channels found at this level, prompt for the next level if applicable
            return Response.sendResponse(res, {
                channels: channels || [],
                message,
                promptFor
            });
        }
    } catch (err) {
        console.error("Error exploring channels:", err);
        return Response.sendError(res, 500, "Server error, please try again later");
    }
};



// Step 2: Explore Country Channels (triggered by user's confirmation)
exports.exploreCountryChannels = async (req, res) => {
    try {
        const limit = 20;
        const userId = new mongoose.Types.ObjectId(req.auth._id);

        // Fetch channels from the user's country
        const countryFilter = {
            country: req.authUser.country,
            followers: { $ne: userId },
            user: { $ne: userId },
            deletedAt: null,
            type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
        };
        if (req.query.search && String(req.query.search).trim() !== '') {
            countryFilter.name = new RegExp('^' + req.query.search, 'i');
        }

        let channels = await Channel.find(countryFilter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            followers: 1,
            type: 1,
        })
        .skip(limit * req.query.page)
        .limit(limit);

        // If channels are found in the country, return them
        if (channels.length > 0) {
            const count = await Channel.find(countryFilter).countDocuments();
            return Response.sendResponse(res, {
                channels,
                more: (count - (limit * (+req.query.page + 1))) > 0
            });
        } else {
            // No channels found in the country, prompt user to explore global channels
            return Response.sendResponse(res, {
                channels: channels || [],
                message: "No channels found in your country. Would you like to explore channels around the world?",
                promptFor: 'global' // Prompt the client to confirm exploring global channels
            });
        }
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, "Server error, please try again later");
    }
};

// Step 3: Explore Global Channels (triggered by user's confirmation)
exports.exploreGlobalChannels = async (req, res) => {
    try {
        const limit = 20;
        const userId = new mongoose.Types.ObjectId(req.auth._id);

        // Fetch global channels
        const globalFilter = {
            followers: { $ne: userId },
            user: { $ne: userId },
            deletedAt: null,
            type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
        };
        if (req.query.search && String(req.query.search).trim() !== '') {
            globalFilter.name = new RegExp('^' + req.query.search, 'i');
        }

        let channels = await Channel.find(globalFilter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            followers: 1,
            type: 1,
        })
        .skip(limit * req.query.page)
        .limit(limit);

        // If channels are found globally, return them
        if (channels.length > 0) {
            const count = await Channel.find(globalFilter).countDocuments();
            return Response.sendResponse(res, {
                channels,
                more: (count - (limit * (+req.query.page + 1))) > 0
            });
        } else {
            // No channels found globally, send final message
            return Response.sendResponse(res, {
                channels: channels || [],
                message: "No channels found around the world."
            });
        }
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, "Server error, please try again later");
    }
};



exports.followedChannels = async (req, res) => {
    console.log('Received request for followed channels:', req.query);
    console.log('Authenticated user ID:', req.auth ? req.auth._id : 'No user ID');
    try {
        // Default query params to safe values to avoid creating a '^undefined' regex
        const { search = '', page = 0, category = '' } = req.query || {};
        
        // Ensure the request contains valid user data
        if (!req.authUser) {
            return Response.sendError(res, 400, 'User not authenticated');
        }
        if (!req.authUser.city) {
            return Response.sendError(res, 400, 'User city information missing');
        }

        // Fetch the full user document (not lean) so we can modify and save it
        const user = await User.findById(req.authUser._id).select('_id city country followedChannels');
        if (!user) {
            return Response.sendError(res, 404, 'User not found');
        }

        // Initialize followedChannels if not present
        if (!user.followedChannels) {
            user.followedChannels = [];
        }

        // Unfollow old city static channels if the user has changed their city
        const unfollowed = await unfollowOldCityStaticChannels(req, user);

        // Ensure static channels for the user's current city exist
        const created = await createStaticChannelsForCity(user.city, user.country, user);
        
        // Save user once if any changes were made to followedChannels
        if (unfollowed || created) {
            await user.save();
            console.log('User followedChannels updated and saved');
        }

        // Ensure the user is following the static channels

        // Define filter to get the channels the user is following
        const filter = {
            followers: {
                $elemMatch: {
                    $eq: new mongoose.Types.ObjectId(req.auth._id)
                }
            },
            name: new RegExp('^' + (search || ''), 'i'),
            enabled: true
        };

        if (category && category.trim() !== '') {
            filter.category = new RegExp('^' + category, 'i');
        }

        const limit = 20;
        const channels = await Channel.find(filter)
            .select('name description photo user approved followers type category city country createdAt')
            .populate({ path: 'user', select: 'name email avatar' })
            .skip(limit * (+page || 0))
            .limit(limit);

        if (!channels) return Response.sendError(res, 400, 'Cannot retrieve channels');

        const count = await Channel.find(filter).countDocuments();
        return Response.sendResponse(res, {
            channels,
            more: (count - (limit * (+req.query.page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Internal Server Error');
    }
};





const createStaticChannelsForCity = async (city, country, user) => {
    const systemUserId = new mongoose.Types.ObjectId('66c7ba8cb077a84040bd9ee6');
    
    const staticChannels = [
        {
            name: `${city} Local News`,
            description: `Stay updated with the latest news in ${city}.`,
            city,
            country,
            user: systemUserId,  // Make sure user is provided
            category: 'news',  // Provide a valid category
            type: 'static',  // Use the correct enum value for `type`
            static: true,  // Mark this as a static channel
            photo: {
                path: '/public/images/avatars/channelsavtar/news.webp',  // Default image path for Local News
                type: 'webp'
            }
        },
        {
            name: `${city} Arts and Culture`,
            description: `Connect with ${city}'s arts scene: theater, music, galleries, and festivals.`,
            city,
            country,
            user: systemUserId,
            category: 'Arts',
            type: 'static',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/arts.webp',
                type: 'webp'
            }
        },
        
        {
            name: `${city} Lost & Found`,
            description: `Find or report lost items in ${city}. Help reunite belongings with their owners.`,
            city,
            country,
            user: systemUserId,
            category: 'Found',
            type: 'static',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/found.webp',
                type: 'webp'
            }
        },
        
        {
            name: `${city} Neighborhood Watch`,
            description: `Stay safe in ${city}. Share security tips, updates, and alerts with your neighbors.`,
            city,
            country,
            user: systemUserId,
            category: 'Watch',
            type: 'static',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/watch.webp',
                type: 'webp'
            }
        },
        {
            name: `${city} Events`,
            description: `Stay informed about upcoming events in ${city}, including their location and schedule.`,
            city,
            country,
            user: systemUserId,
            category: 'Events',
            type: 'static_events',
            static: true,
            calendar: [],
            time: '',
            location: '',
            photo: {
                path: '/public/images/avatars/channelsavtar/Events.webp',
                type: 'webp'
            }
        },
        {
            name: `${city} Dating`,
            description: `Find your match in ${city}. Connect with people based on interests, age, and relationship goals.`,
            city,
            country,
            user: systemUserId,
            category: 'Dating',
            type: 'static_dating',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/dating.webp', // Adjust the path as necessary
                type: 'webp'
            },
            relationshipGoals: [], // User will choose their relationship goals (e.g., casual, long-term, friendship)
            ageRange: { min: null, max: null }, // Leave min and max null, to be filled by user
            interests: [], // User will select their interests or hobbies as tags
            hintAboutMe: '' // A free-text field where users can write something about themselves
        }
        
        

    ];

    let userModified = false;
    for (const channelData of staticChannels) {
        // Check if the static channel already exists in the database
        let channel = await Channel.findOne({ name: channelData.name, city });
        let channelModified = false;

        if (!channel) {
            // If the static channel doesn't exist, create it
            channel = new Channel(channelData);
            // Ensure followers array is initialized
            if (!channel.followers) {
                channel.followers = [];
            }
            channelModified = true;
        }

        // Ensure the user is following the static channel
        if (!channel.followers || !channel.followers.some(f => String(f) === String(user._id))) {
            if (!channel.followers) channel.followers = [];
            channel.followers.push(user._id);  // Add user to channel's followers
            channelModified = true;
        }

        // Ensure the channel is in the user's followedChannels array
        if (user && user.followedChannels && !user.followedChannels.some(c => String(c) === String(channel._id))) {
            user.followedChannels.push(channel._id);  // Add channel to user's followed channels
            userModified = true;
        }

        // Save the updated channel if changed
        if (channelModified) {
            await channel.save();
        }
    }

    return userModified;
};

const unfollowOldCityStaticChannels = async (req, user) => {
    console.log(`Checking for static channels to unfollow for user: ${user._id} in city: ${user.city}`);

    // Find all static, static_events, and static_dating channels the user follows
    const filter = {
        followers: {
            $elemMatch: {
                $eq: new mongoose.Types.ObjectId(req.auth._id)
            }
        },
        type: { $in: ['static', 'static_events', 'static_dating'] }, // Check for these types of channels
        enabled: true
    };

    const allStaticChannels = await Channel.find(filter, {
        name: 1,
        description: 1,
        photo: "$photo.path",
        user: 1,
        followers: 1,
        city: 1,     // Include the city field
        type: 1      // Include the type field
    });

    console.log('All static channels for this user.', allStaticChannels);

    if (allStaticChannels.length === 0) {
        console.log('No static channels found for this user.');
    } else {
        console.log('Listing all static channels the user is following:');
        allStaticChannels.forEach(channel => {
            console.log(`Channel: ${channel.name}, City: ${channel.city}, Type: ${channel.type}, User City: ${user.city}`);
        });
    }

    let userModified = false;
    // Unfollow static channels if the city doesn't match the user's city
    for (const channel of allStaticChannels) {
        if (channel.city !== user.city) {
            console.log(`Unfollowing static channel: ${channel.name} as the city does not match`);

            // Remove the user from the channel's followers
            const followerIndex = channel.followers.indexOf(user._id);
            if (followerIndex !== -1) {
                channel.followers.splice(followerIndex, 1);
                await channel.save();
                console.log(`User ${user._id} removed from followers of channel ${channel.name}`);
            } else {
                console.log(`User ${user._id} not found in followers of channel ${channel.name}`);
            }

            // Remove the channel from the user's followedChannels array
            const channelIndex = user.followedChannels.indexOf(channel._id);
            if (channelIndex !== -1) {
                user.followedChannels.splice(channelIndex, 1);
                userModified = true;
                console.log(`Channel ${channel.name} removed from user's followedChannels`);
            } else {
                console.log(`Channel ${channel.name} not found in user's followedChannels`);
            }
        }
    }

    return userModified;
};



exports.myChannels = async (req, res) => {
    try {
        const { search = '', page = 0, category = '' } = req.query || {};
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            name: new RegExp('^' + search, 'i'),
            enabled: true
        };

        if (category && category.trim() !== '') {
            filter.category = new RegExp('^' + category, 'i');
        }

        const limit = 20;

        const channels = await Channel.find(filter)
            .select('name description photo user followers approved type category city country createdAt')
            .populate({ path: 'user', select: 'name email avatar' })
            .skip(limit * page)
            .limit(limit);

        const count = await Channel.find(filter).countDocuments();

        return Response.sendResponse(res, {
            channels,
            more: (count - (limit * (+page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.storeChannel = async (req, res) => {
    try {
        const fields = _.omit(req.fields, ['photo', 'image']);
        let channel = new Channel(fields);
        channel.user = req.auth._id;

        // Automatically add the creator as a follower
        channel.followers.push(req.auth._id);

        // Set country and city from authUser if not provided
        if (!channel.country || !channel.city) {
            channel.country = req.authUser.country;
            channel.city = req.authUser.city;
        }

        // Handle storing the channel photo
        if (req.files && (req.files.photo || req.files.image)) {
            await storeChannelPhoto(req, channel);
        } else {
            // Use default photo if none provided
            if (!channel.photo || typeof channel.photo !== 'object') {
                channel.photo = {};
            }
            channel.photo.path = '/channels/channel-default.png';
            channel.photo.format = 'png';
        }

        // Save the channel
        await channel.save();

        // Update the photo path with the base URL
        channel.photo.path = (res.locals && res.locals.BASEURL ? res.locals.BASEURL : process.env.BASEURL) + channel.photo.path;

        return Response.sendResponse(res, channel, 'The channel has been created successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.updateChannel = async (req, res) => {
    try {
        console.log('channel update')
        const fields = _.omit(req.fields, ['photo', 'image', 'upload']);

        let channel = _.extend(req.channel, fields)

        if (req.files.photo || req.files.image || req.files.upload) {
            await storeChannelPhoto(req, channel)
        }
        
        channel.global = fields.global ? (fields.global == 'undefined' ? false : true) : false;
        await channel.save();
        return Response.sendResponse(res, channel, 'the channel has been updated successfully')
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.disableChannel = async (req, res) => {
    try {
        const channel = req.channel;
        channel.enabled = false;
        await channel.save();
        return Response.sendResponse(res, null, 'channel removed');
    } catch (err) {
        console.error('Error disabling channel:', err);
        return Response.sendError(res, 400, 'could not remove channel');
    }
};

exports.deleteChannel = async(req, res) => {
    try {
        const channel = req.channel
        // Prevent deletion of static channels (system-managed)
        if (channel.static || ['static', 'static_events', 'static_dating'].includes(channel.type)) {
            return Response.sendError(res, 400, 'Static channels cannot be deleted');
        }
        exports.destroyChannel(res, channel._id, (res) => Response.sendResponse(res, null, 'channel removed'))
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to delete channel');
    }
}

exports.followChannel = async (req, res) => {
    try {
        const channel = req.channel;
        const user = req.authUser;

        if (!user) {
            return Response.sendError(res, 401, 'Unauthorized');
        }

        const userIdStr = String(user._id);
        const channelIdStr = String(channel._id);

        // Check if already following
        const isFollowing = channel.followers.some(f => String(f) === userIdStr);

        if (!isFollowing) {
            // Follow
            await Channel.findByIdAndUpdate(channel._id, { $addToSet: { followers: user._id } });
            await User.findByIdAndUpdate(user._id, { $addToSet: { followedChannels: channel._id } });
            
            sendNotification({
                en: channel.name
            }, {
                en: `${user.firstName} ${user.lastName} started following the channel`
            }, {
                type: 'follow-channel',
                link: `/tabs/channels/channel/${channel._id}`
            }, [], [channel.user]);

            return Response.sendResponse(res, { followed: true }, 'Followed successfully');
        } else {
            // Unfollow
            // Prevent the channel owner from unfollowing their own channel
            if (channel.user && String(channel.user) === userIdStr) {
                return Response.sendError(res, 400, 'Channel owner cannot unfollow their own channel');
            }

            await Channel.findByIdAndUpdate(channel._id, { $pull: { followers: user._id } });
            await User.findByIdAndUpdate(user._id, { $pull: { followedChannels: channel._id } });

            return Response.sendResponse(res, { followed: false }, 'Unfollowed successfully');
        }
    } catch (error) {
        console.error('Follow channel error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.getCityChannels = async (req, res) => {
    try {
        const { city, country } = req.query;
        const filter = {
            city,
            country,
            type: { $in: ['static', 'static_events', 'static_dating'] },
            enabled: true
        };

        const channels = await Channel.find(filter)
            .select('name description photo user approved followers type city country createdAt')
            .populate({ path: 'user', select: 'name email avatar' });

        return Response.sendResponse(res, { channels });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.destroyChannel = async (res, channelId, callback) => {
    try {
        await Channel.deleteMany({ _id: channelId });
        await Report.deleteMany({ "entity.id": channelId, "entity.name": 'channel' });

        const posts = await Post.find({ channel: channelId });
        posts.forEach(post => destroyPost(res, post._id, null));

        if (callback) return callback(res);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Failed to delete channel');
    }
};

