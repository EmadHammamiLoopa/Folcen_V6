'use strict';

const mongoose = require('mongoose');

const openingLeaseSchema = new mongoose.Schema({
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    enum: ['reserved', 'opened'],
    default: 'reserved',
    required: true,
  },
  reservedAt: {
    type: Date,
    required: true,
  },
  openedAt: {
    type: Date,
    default: null,
  },
}, { _id: false });

const chatOpeningLeaseSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  leases: {
    type: [openingLeaseSchema],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model('ChatOpeningLease', chatOpeningLeaseSchema);
