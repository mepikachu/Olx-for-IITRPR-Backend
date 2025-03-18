const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Ensure exactly two participants
ConversationSchema.index({ participants: 1 });
ConversationSchema.path('participants').validate(function (value) {
  return value.length === 2;
}, 'A conversation must have exactly two participants.');

module.exports = mongoose.model('Conversation', ConversationSchema);