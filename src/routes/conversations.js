const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const authenticate = require('../middleware/auth');

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
      .populate('messages.sender', 'userName')
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
      .populate('participants', 'userName')
      .populate('messages.sender', 'userName');
    
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

// Send message in conversation
router.post('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { text, replyToMessageId } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }
    
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (!conversation.participants.map(p => p.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const message = {
      sender: req.user._id,
      text,
      replyToMessageId,
      createdAt: new Date()
    };
    
    conversation.messages.push(message);
    await conversation.save();
    
    res.json({ success: true, message: 'Message sent', conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;