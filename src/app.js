const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const authenticate = require('../middleware/auth');

// Get all notifications for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, notifications });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;