const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: {
    type: String, // The text content of the message
  },
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // The sender of the message
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // The recipient of the message
  },
  image: {
    path: {
      type: String, // Path to the image file
    },
    type: {
      type: String, // The MIME type of the image (e.g., "image/jpeg")
    }
  },
  state: {
    type: String,
    enum: ['deleted', 'seen', 'sent'], // The state of the message
    default: 'sent'
  },
  media: [{
    path: String,
    type: String, // MIME type
    thumbnail: String, // Optional thumbnail for videos
  }],
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date }
  }],
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  type: {
    type: String, // Add the type field
    required: true // Make it a required field
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product', // Reference to the Product if the message is about a product
  },
    status: { type: String, enum: ['pending', 'accepted', 'cancelled'], default: null },

}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

module.exports = mongoose.model('Message', messageSchema);
