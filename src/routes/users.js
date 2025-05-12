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
      .select('-images')
      .sort('-createdAt')
      .lean();

    // my_purchases
    const purchasedProducts = await Product.find({ buyer: req.user._id })
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
    const updateData = {};

    // Basic validation
    if (userName !== undefined) {
      if (userName.trim().length < 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'Username must be at least 2 characters long' 
        });
      }
      updateData.userName = userName.trim();
    }

    if (phone !== undefined) {
      if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Phone number must be 10 digits' 
        });
      }
      updateData.phone = phone;
    }

    if (address) {
      updateData.address = {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        zipCode: address.zipCode || ''
      };
    }

    // Handle profile picture
    if (profilePicture && profilePicture.data) {
      try {
        // Check if the image data is valid base64
        const imageBuffer = Buffer.from(profilePicture.data, 'base64');
        updateData.profilePicture = {
          data: imageBuffer,
          contentType: profilePicture.contentType || 'image/jpeg'
        };
      } catch (error) {
        console.error('Profile picture processing error:', error);
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid profile picture format' 
        });
      }
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No valid fields to update' 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        select: '-password -authCookie -authCookieCreated -authCookieExpires' 
      }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Convert user object to plain object and modify profile picture
    const userObject = user.toObject();
    if (userObject.profilePicture && userObject.profilePicture.data) {
      userObject.profilePicture.data = userObject.profilePicture.data.toString('base64');
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: userObject
    });

  } catch (err) {
    console.error('Profile update error:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        error: `This ${field} is already in use` 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile. Please try again.' 
    });
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
      .select('-email -password -phone -soldProducts -warningIssued -isBlocked -blockedAt -blockedReason -authCookie -authCookieCreated -authCookieExpires');
    
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