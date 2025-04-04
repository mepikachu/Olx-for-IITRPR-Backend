const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const authenticate = require('../middleware/auth');

// Get all notifications for the current user
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      userId: req.user._id 
    })
    .sort({ createdAt: -1 }) // Sort by newest first
    .populate('productId', 'name');

    res.json({ 
      success: true, 
      notifications 
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.notificationId,
        userId: req.user._id
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
