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

// Get conversation messages since a specific ID
router.get('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { since } = req.query;
    
    // Find the conversation
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'userName')
      .populate({
        path: 'messages',
        populate: {
          path: 'sender',
          select: 'userName'
        }
      });
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    
    // Verify user is a participant
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this conversation' });
    }
    
    let messages = [];
    
    // If "since" parameter is provided, only get messages after that one
    if (since) {
      const sinceMessage = await Message.findById(since);
      
      if (sinceMessage) {
        messages = await Message.find({
          _id: { $ne: since },
          conversationId: conversationId,
          createdAt: { $gt: sinceMessage.createdAt }
        })
        .populate('sender', 'userName')
        .sort({ createdAt: 1 });
      } else {
        // If message not found, return all messages
        messages = conversation.messages;
      }
    } else {
      // If no "since" parameter, return all messages
      messages = conversation.messages;
    }
    
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Send message in conversation
router.post('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { text, replyToMessageId, tempId } = req.body;
    const senderId = req.user.id;

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

    const otherUserId = conversation.participants.find(
      participant => participant.toString() !== senderId
    );

    // Check if the recipient has blocked the sender
    const blockExists = await BlockList.findOne({
      blocker: otherUserId,
      blocked: senderId
    }) || await BlockList.findOne({
      blocker: senderId,
      blocked: otherUserId
    });

    let createdMessage;

    if (!blockExists) {
      conversation.messages.push(message);
      await conversation.save();
      createdMessage = conversation.messages[conversation.messages.length - 1];
    } else {
      createdMessage = {
        _id: tempId || new mongoose.Types.ObjectId().toString(), // Generate a fake ID
        sender: req.user._id,
        text,
        replyToMessageId,
        createdAt: new Date()
      };
    }

    res.json({ 
      success: true, 
      message: 'Message sent', 
      tempId: tempId, 
      serverMessage: createdMessage
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;