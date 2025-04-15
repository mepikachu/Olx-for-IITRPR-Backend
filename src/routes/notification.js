const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/notification');

// Get all notifications for a user
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('productId')
      .populate('offerId')
      .populate('reportId');

    res.json(notifications);
  } catch (error) {
    res.status(500).send({ message: 'Server error', error: error.message });
  }
});

// Get notifications after a specific notificationId
router.get('/after/:notificationId', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user._id,
      notificationId: { $gt: parseInt(req.params.notificationId) }
    })
    .sort({ notificationId: 1 })
    .populate('productId')
    .populate('offerId')
    .populate('reportId');

    res.json(notifications);
  } catch (error) {
    res.status(500).send({ message: 'Server error', error: error.message });
  }
});

// Mark a notification as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).send({ message: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).send({ message: 'Server error', error: error.message });
  }
});

module.exports = router;