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
    .populate('productId')  // Fully populate the product details
    .populate('offerId')  // Add this line to populate offer details
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

module.exports = router;
