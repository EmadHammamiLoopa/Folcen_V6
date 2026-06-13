const Notification = require('../models/Notification');
const Response = require('./Response');
const { emitToUser, cleanNotificationDoc } = require('../helpers');

/** GET /api/v1/notifications — list recent notifications for the auth user */
exports.list = async (req, res) => {
  try {
    const userId = req.auth._id;
    const limit  = parseInt(req.query.limit)  || 30;
    const page   = parseInt(req.query.page)   || 0;

    const [docs, unread] = await Promise.all([
      Notification.find({ recipient: userId })
        .populate('sender', 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant')
        .sort({ createdAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: userId, read: false })
    ]);

    const safeDocs = docs.map(doc => cleanNotificationDoc(doc));
    return Response.sendResponse(res, { docs: safeDocs, unread, page, limit }, 'Notifications fetched');
  } catch (err) {
    console.error('NotificationController.list error:', err);
    return Response.sendError(res, 500, 'Server error');
  }
};

/** POST /api/v1/notifications/read — mark all notifications as read */
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.auth._id;
    await Notification.updateMany({ recipient: userId, read: false }, { $set: { read: true } });

    // Tell the frontend the badge should reset to 0
    emitToUser(String(userId), 'notifications-read', { unread: 0 });

    return Response.sendResponse(res, { unread: 0 }, 'Notifications marked as read');
  } catch (err) {
    console.error('NotificationController.markAllRead error:', err);
    return Response.sendError(res, 500, 'Server error');
  }
};

/** POST /api/v1/notifications/:id/read — mark single notification as read */
exports.markOneRead = async (req, res) => {
  try {
    const userId = req.auth._id;
    await Notification.updateOne({ _id: req.params.id, recipient: userId }, { $set: { read: true } });
    const unread = await Notification.countDocuments({ recipient: userId, read: false });
    return Response.sendResponse(res, { unread }, 'Notification marked as read');
  } catch (err) {
    console.error('NotificationController.markOneRead error:', err);
    return Response.sendError(res, 500, 'Server error');
  }
};
