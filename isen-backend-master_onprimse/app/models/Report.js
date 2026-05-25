/**
 * Report model
 * Consolidated report schema. This file intentionally avoids overwriting an
 * already-compiled model to prevent `OverwriteModelError` during hot reloads
 * or when multiple modules require this file.
 *
 * Privacy design: reports store only minimal metadata and references to the
 * target entity. Content is not duplicated unless required for an
 * investigation. Reports are retained until resolved and are linked to
 * event logs (call/message events) when relevant.
 */
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  // Who filed the report
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Optional free-text message from reporter (investigator-visible)
  message: { type: String, default: null },

  // Reference to the reported entity; `refPath` enables dynamic refs
  entity: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'entityModel' },
  entityModel: { type: String, required: true, enum: ['User','Post','Comment','Channel','Product','Job','Service','Message','Call','Photo'] },
  photoUrl: { type: String, default: null }, // For reporting specific gallery photos

  // Categorizations for moderation workflows
  reasonCode: { type: String, default: 'unspecified' },
  reportType: { type: String, enum: ['Abuse','Spam','Inappropriate Content','Hate Speech','Misinformation','Harassment','Violence','Copyright Infringement','Scam','Illegal Activities','Other'], default: 'Other' },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

  // GDPR & Audit Trail
  reporterIp: { type: String },
  reporterUserAgent: { type: String },
  consentGiven: { type: Boolean, default: false }, // GDPR: Explicit consent for processing report data
  isAnonymous: { type: Boolean, default: false }, // Reporter choice to remain anonymous to the reported party
  evidence: [{ type: String }], // URLs or snapshots of content
  retentionDate: { type: Date }, // GDPR: Date when this report should be anonymized or deleted

  // Status / resolution fields
  status: { type: String, enum: ['open','under_review','resolved','dismissed'], default: 'open', index: true },
  resolutionAction: { type: String, enum: ['Content Removed','User Banned','User Deleted (GDPR)','Resolved','No Action'], default: 'No Action' },
  moderatorNotes: { type: String, default: null },

  // Link to non-content event logs (call/message) for investigations
  linkedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CallEvent' }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, { collection: 'reports' });

ReportSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });

// Avoid OverwriteModelError when the file is required multiple times
module.exports = mongoose.models.Report || mongoose.model('Report', ReportSchema);
