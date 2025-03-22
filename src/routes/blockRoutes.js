// routes/blockRoutes.js
const express = require('express');
const router = express.Router();
const BlockList = require('../models/BlockList');
const auth = require('../middleware/auth');

// Block a user
router.post('/block/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent self-blocking
    if (req.user.id === userId) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }
    
    // Check if already blocked
    const existingBlock = await BlockList.findOne({
      blocker: req.user.id,
      blocked: userId
    });
    
    if (existingBlock) {
      return res.status(400).json({ message: 'User is already blocked' });
    }
    
    // Create new block
    const blockList = new BlockList({
      blocker: req.user.id,
      blocked: userId
    });
    
    await blockList.save();
    res.status(200).json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unblock a user
router.delete('/unblock/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await BlockList.findOneAndDelete({
      blocker: req.user.id,
      blocked: userId
    });
    
    if (!result) {
      return res.status(400).json({ message: 'User was not blocked' });
    }
    
    res.status(200).json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all blocked users
router.get('/blocked', auth, async (req, res) => {
  try {
    const blockedList = await BlockList.find({ blocker: req.user.id })
      .populate('blocked', 'name email profilePic')
      .sort({ createdAt: -1 });
    
    res.status(200).json(blockedList);
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
