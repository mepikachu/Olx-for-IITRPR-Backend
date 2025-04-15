const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const authenticate = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      userId: req.user._id 
    })
    .sort({ createdAt: -1 })
    .setOptions({ strictPopulate: false })
    .populate('productId')  // Fully populate the product details
    .populate('offerId')  // Add this line to populate offer details
    .populate('reportId')
    .exec();

    res.json({ 
      success: true, 
      notifications: notifications.map(notification => ({
        ...notification.toObject(),
        productId: notification.productId?._id,  // Only send the product ID
        offerId: notification.offerId?._id  // Include offer ID in response
      }))
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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
