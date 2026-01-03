const Response = require('../controllers/Response')
const { adminCheck } = require('../helpers')
const Channel = require('./../models/Channel')
const mongoose = require('mongoose');

exports.channelById = async (req, res, next, id) => {
    try {
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return Response.sendError(res, 400, 'Invalid Channel ID format');
        }
        const channel = await Channel.findOne({ _id: id });

        if (!channel) {
            return Response.sendError(res, 400, 'Channel not found');
        }

        req.channel = channel;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.channelOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }

    if(req.auth._id != req.channel.user){
        return Response.sendError(res, 403, 'Access denied')
    }

    next();
}

exports.isFollowedChannel = (req, res, next) => {
    try{
        const channel = req.channel
        const userId = req.auth._id
        if(!channel.followers.includes(userId) && channel.user != req.auth._id){
            return Response.sendError(res, 400, 'access denied on this channel')
        }
        next()
    }catch(err){
        console.log(err);
    }
}