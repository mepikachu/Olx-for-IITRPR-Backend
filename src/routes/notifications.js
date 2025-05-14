const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const authenticate = require('../middleware/auth');

// Get all notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      userId: req.user._id 
    })
    .sort({ createdAt: -1 })
    .populate('productId', 'name status')  // Add this line to populate product details
    .populate('offerId', '_id status')     // Add this line to populate offer details
    .lean();  // Convert to plain JavaScript objects

    res.json({ 
      success: true, 
      notifications: notifications.map(notification => ({
        ...notification,
        read: notification.read || false,  // Ensure read status is included
      }))
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch notifications' 
    });
  }
});

// Get notifications after a specific ID
router.get('/after/:notificationId', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user._id,
      _id: { $gt: req.params.notificationId }
    })
    .sort({ createdAt: -1 })
    .populate('productId', 'name status')
    .populate('offerId', '_id status')
    .lean();

    res.json({ 
      success: true, 
      notifications: notifications.map(notification => ({
        ...notification,
        read: notification.read || false,
      }))
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch new notifications'
    });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to update notification'
    });
  }
});

// Mark all notifications as read
router.put('/notifications/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to update notifications'
    });
  }
});

module.exports = router;
