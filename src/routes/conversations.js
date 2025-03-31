const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const authenticate = require('../middleware/auth');
const BlockList = require('../models/blockList');

// Create or retrieve a conversation
router.post('/', authenticate, async (req, res) => {
  try {
    const { participantId } = req.body;
    
    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }
    
    const participants = [req.user._id, participantId].sort();
    
    let conversation = await Conversation.findOne({
      participants: { $all: participants }
    });
    
    if (!conversation) {
      conversation = new Conversation({
        participants,
        nextMessageId: 1
      });
      await conversation.save();
    }
    
    res.json({ success: true, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Get all conversations for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id
    })
    .populate('participants', 'userName')
    .lean();
    
    res.json({ success: true, conversations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get conversation by ID
router.get('/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants', 'userName');
      
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    res.json({ success: true, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Fetch messages after a specific ID
router.get('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { lastId } = req.query;
    
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    let messages = [];
    if (lastId) {
      // Find messages after the lastId
      const lastIdNum = parseInt(lastId);
      messages = conversation.messages.filter(msg => msg.messageId > lastIdNum);
    } else {
      // Return all messages if no lastId provided
      messages = conversation.messages;
    }
    
    // Check if the other user has blocked this user
    const otherUserId = conversation.participants.find(
      p => p.toString() !== req.user._id.toString()
    );
    
    const blockExists = await BlockList.findOne({
      blocker: otherUserId,
      blocked: req.user._id
    });
    
    // If blocked, filter out messages that should be hidden
    if (blockExists) {
      messages = messages.filter(msg =>
        msg.sender.toString() === req.user._id.toString()
      );
    }
    
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Send message - unified endpoint for all message types
router.post('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { text, replyTo, replyType, tempId } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }
    
    const conversation = await Conversation.findById(req.params.conversationId);
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const currentMessageId = conversation.nextMessageId || 1;
    
    const message = {
      messageId: currentMessageId,
      sender: req.user._id,
      text,
      createdAt: new Date()
    };
    
    // Handle reply to message or product
    if (replyTo && replyType) {
      message.replyTo = {
        id: replyTo,
        type: replyType // 'message' or 'product'
      };
    }
    
    // Check if the recipient has blocked the sender
    const otherUserId = conversation.participants.find(
      p => p.toString() !== req.user._id.toString()
    );
    
    const blockExists = await BlockList.findOne({
      blocker: otherUserId,
      blocked: req.user._id
    });
    
    // Always increment message ID regardless of block status
    conversation.nextMessageId = currentMessageId + 1;
    
    if (!blockExists) {
      conversation.messages.push(message);
    }
    
    await conversation.save();
    
    res.json({
      success: true,
      message: 'Message sent',
      messageId: currentMessageId,
      tempId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
