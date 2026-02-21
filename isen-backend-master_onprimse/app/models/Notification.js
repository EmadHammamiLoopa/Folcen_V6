const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:      { type: String, required: true },
  title:     { type: String, default: '' },
  body:      { type: String, default: '' },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
