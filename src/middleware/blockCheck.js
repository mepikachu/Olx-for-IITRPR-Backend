// middleware/blockCheck.js
const BlockList = require('../models/BlockList');

// Middleware to check if a user is blocked
const blockCheck = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.body.userId || req.query.userId;
    
    if (!userId || !req.user) {
      return next();
    }
    
    // Check if either user has blocked the other
    const blockExists = await BlockList.findOne({
      $or: [
        { blocker: req.user.id, blocked: userId },
        { blocker: userId, blocked: req.user.id }
      ]
    });
    
    if (blockExists) {
      return res.status(403).json({ message: 'Action not allowed - user is blocked or has blocked you' });
    }
    
    next();
  } catch (error) {
    console.error('Block check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = blockCheck;