const express = require('express');
const router = express.Router();
const User = require('../models/user');
const authenticate = require('../middleware/auth');
const Donation = require('../models/donation');
const LostItem = require('../models/lostItem');
const Product = require('../models/product');

// Get user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password');

    // my_donations
    const donations = await Donation.find({ donatedBy: req.user._id })
      .populate('collectedBy', 'userName')
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_lost_items
    const lost_items = await LostItem.find({ user: req.user._id })
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_listings
    const products = await Product.find({ seller: req.user._id })
      .populate('buyer', 'userName')
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_purchases
    const purchasedProducts = await Product.find({ buyer: req.user._id })
      .populate('seller', 'userName')
      .select('-images')
      .sort('-createdAt')
      .lean();

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        password: undefined
      },
      activity: {
        donations,
        lost_items,
        products,
        purchasedProducts
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
    const { userName, phone, address, profilePicture } = req.body;

    // 1) Find the user document
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 2) Mutate only the fields the client sent
    if (userName)       user.userName        = userName;
    if (phone)          user.phone           = phone;
    if (address)        user.address         = address;
    if (profilePicture) {
      user.profilePicture = {
        data: Buffer.from(profilePicture, 'base64'),
        contentType: 'image/jpeg'
      };
    }

    await user.save();

    // 4) Remove sensitive data before sending
    const result = user.toObject();
    delete result.password;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: result
    });
  } catch (err) {
    console.error('Profile update error:', err);
    if (err.code === 11000 && err.keyPattern) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ success: false, error: `${field} already exists` });
    }
    res.status(500).json({ success: false, error: err.message });
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

    // Find the user
    const user = await User.findById(requestedUserId)
      .select('-password -warningIssued -isBlocked -blockedAt -blockedReason -authCookie -authCookieCreated -authCookieExpires');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    const donations = await Donation.find({ donatedBy: requestedUserId })
      .populate('collectedBy', 'userName')
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_lost_items
    const lost_items = await LostItem.find({ user: requestedUserId })
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_listings
    const products = await Product.find({ seller: requestedUserId })
      .populate('buyer', 'userName')
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_purchases
    const purchasedProducts = []; // return empty for security and privacy purposes

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        password: undefined
      },
      activity: {
        donations,
        lost_items,
        products,
        purchasedProducts
      }
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});


module.exports = router;
