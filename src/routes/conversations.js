const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const authenticate = require('../middleware/auth');
const BlockList = require('../models/blockList');

// Create or retrieve a conversation
router.post('/', authenticate, async (req, res) => {
  try {
    const { participantId, productPreview, firstMessage } = req.body;
    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }

    const participants = [req.user._id, participantId].sort();
    let conversation = await Conversation.findOne({
      participants: { $all: participants }
    });

    if (!conversation) {
      conversation = new Conversation({ participants });
      
      if (productPreview && firstMessage) {
        const productReplyMessage = {
          type: 'product_reply',
          productId: productPreview.productId,
          productName: productPreview.productName,
          price: productPreview.price,
          image: productPreview.image,
          createdAt: new Date(),
        };
        const userMessage = {
          sender: req.user._id,
          text: firstMessage,
          createdAt: new Date()
        };
        conversation.messages.push(productReplyMessage);
        conversation.messages.push(userMessage);
      }
    }

    await conversation.save();
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
      // Removed .populate('messages.sender', 'userName') to keep messages non-populated
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
      // Removed .populate('messages.sender', 'userName') to keep messages non-populated
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (!conversation.participants.map(p => p._id.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    res.json({ success: true, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// routes/conversations.js
// Inside the postMessage route handler
router.post('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const senderId = req.user.id;
    
    // Get the conversation to find the other user
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Find the other participant
    const otherUserId = conversation.participants.find(
      participant => participant.toString() !== senderId
    );
    
    // Check if the recipient has blocked the sender
    const blockExists = await BlockList.findOne({
      blocker: otherUserId,
      blocked: senderId
    });
    
    // Create the message
    const message = new Message({
      conversation: conversationId,
      sender: senderId,
      text
    });
    
    await message.save();
    
    // If not blocked, emit the message to the room
    if (!blockExists) {
      io.to(conversationId).emit('message', {
        _id: message._id,
        sender: senderId,
        text,
        createdAt: message.createdAt
      });
    }
    
    // Always respond with success to the sender
    return res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;