const express = require('express');
const router = express.Router();
const User = require('../models/user');
const authenticate = require('../middleware/auth');

// Get pending volunteer requests (admin only)
router.get('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const requests = await User.find({ role: 'volunteer_pending' }).select('-password');
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Approve a volunteer request (admin only)
router.post('/:userId/approve', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const user = await User.findById(req.params.userId);
    if (!user || user.role !== 'volunteer_pending') {
      return res.status(404).json({ success: false, error: 'Volunteer not found or already approved' });
    }
    user.role = 'volunteer';
    await user.save();
    res.json({ success: true, message: 'Volunteer approved' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Reject a volunteer request (admin only)
router.post('/:userId/reject', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    await User.findByIdAndDelete(req.params.userId);
    res.json({ success: true, message: 'Volunteer request rejected and user removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;