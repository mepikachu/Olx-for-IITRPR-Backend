const express = require('express');
const router = express.Router();
const User = require('../models/user');
const authenticate = require('../middleware/auth');

// Get all users (admin only)
router.get('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Unauthorized: Admin access required' 
    });
  }

  try {
    const users = await User.find()
      .select('-password')
      .populate('soldProducts purchasedProducts');
    res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('soldProducts purchasedProducts')
      .select('-password');

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        password: undefined
      }
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Update user profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const { userName, phone, address } = req.body;
    const updateData = {};

    if (userName) updateData.userName = userName;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = JSON.parse(address);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    console.error('Profile update error:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        error: `${field} already exists` 
      });
    }
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete user account (admin only)
router.delete('/:userId', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Unauthorized: Admin access required' 
    });
  }

  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user by ID (admin only)
router.get('/:userId', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Unauthorized: Admin access required' 
    });
  }

  try {
    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('soldProducts purchasedProducts');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user profile picture
router.get('/profile-picture/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user || !user.profilePicture || !user.profilePicture.data) {
      return res.status(404).json({ 
        success: false, 
        error: 'Profile picture not found' 
      });
    }

    res.set('Content-Type', user.profilePicture.contentType);
    res.send(user.profilePicture.data);
  } catch (err) {
    console.error('Error fetching profile picture:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user profile by ID (for viewing)
router.get('/profile/:userId', authenticate, async (req, res) => {
  try {
    const requestedUserId = req.params.userId;
    const isAdmin = req.user.role === 'admin';
    
    // Find the user
    const user = await User.findById(requestedUserId)
      .select('-password -authCookie -authCookieCreated -authCookieExpires');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Find user's donations
    const donations = await require('../models/donation').find({ 
      donatedBy: requestedUserId 
    });
    
    // If not admin, filter what data to show
    if (!isAdmin && req.user._id.toString() !== requestedUserId) {
      // For non-admins viewing other profiles, only return limited info
      return res.json({
        success: true,
        user: {
          _id: user._id,
          userName: user.userName,
          role: user.role,
          address: user.address,
          profilePicture: user.profilePicture ? true : false,
          registrationDate: user.registrationDate
        },
        donations: donations.map(d => ({
          _id: d._id,
          name: d.name,
          description: d.description,
          status: d.status,
          donationDate: d.donationDate
        }))
      });
    }
    
    // Admin view or user viewing their own profile
    return res.json({
      success: true,
      user: user,
      donations: donations
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});


module.exports = router;