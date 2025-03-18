const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const multer = require('multer');
const User = require('../models/user');
const authenticate = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Login route
router.post('/login', upload.none(), async (req, res) => {
  try {
    const { identifier, password, authCookie: providedAuthCookie } = req.body;

    if (providedAuthCookie) {
      const userByCookie = await User.findOne({ authCookie: providedAuthCookie }).select('+password');
      if (userByCookie && userByCookie.authCookieExpires >= Date.now()) {
        return res.json({
          success: true,
          message: "Login successful via auth cookie",
          authCookie: userByCookie.authCookie,
          user: {
            id: userByCookie._id,
            userName: userByCookie.userName,
            email: userByCookie.email,
            role: userByCookie.role
          }
        });
      }
      return res.status(401).json({ success: false, error: 'Invalid or expired auth cookie' });
    }

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Identifier and password are required' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }]
    }).select('+password');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const newAuthCookie = crypto.randomBytes(64).toString('hex');
    user.authCookie = newAuthCookie;
    user.authCookieCreated = new Date();
    user.authCookieExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    res.cookie('authCookie', newAuthCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: "Login successful",
      authCookie: newAuthCookie,
      user: {
        id: user._id,
        userName: user.userName,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Register route
router.post('/register', upload.single('profilePicture'), async (req, res) => {
  try {
    const { userName, email, phone, password, address, role } = req.body;
    if (!userName || !email || !phone || !password) {
      return res.status(400).json({ success: false, error: 'All required fields missing' });
    }

    const newUser = new User({
      userName,
      email,
      phone,
      password,
      address: JSON.parse(address),
      role: role === 'volunteer' ? 'volunteer_pending' : 'user'
    });

    if (req.file) {
      newUser.profilePicture = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    await newUser.save();

    const newAuthCookie = crypto.randomBytes(64).toString('hex');
    newUser.authCookie = newAuthCookie;
    newUser.authCookieCreated = new Date();
    newUser.authCookieExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await newUser.save();

    res.cookie('authCookie', newAuthCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    
    res.status(201).json({
      success: true,
      user: {
        id: newUser._id,
        userName: newUser.userName,
        email: newUser.email,
        role: newUser.role
      },
      authCookie: newAuthCookie
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ success: false, error: `${field} already exists` });
    }
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Logout route
router.post('/logout', authenticate, async (req, res) => {
  try {
    req.user.authCookie = null;
    req.user.authCookieCreated = null;
    req.user.authCookieExpires = null;
    await req.user.save();

    res.clearCookie('authCookie');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get current user
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
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;