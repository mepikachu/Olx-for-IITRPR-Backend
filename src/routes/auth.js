const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const multer = require('multer');
const User = require('../models/user');
const Verification = require('../models/verification.js');
const authenticate = require('../middleware/auth');
const nodemailer = require('nodemailer');

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

const sendEmail = async ({ to, subject, text, html }) => {
  // Create a transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail', // or use SMTP details
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  // Send mail
  const info = await transporter.sendMail({
    from: `"OLX for IITRPR" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html: html || text
  });

  return info;
};

router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email already registered' 
      });
    }
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Generate a verification ID
    const verificationId = crypto.randomBytes(32).toString('hex');
    
    // Store OTP in database with expiry (15 minutes)
    const verification = new Verification({
      email,
      otp,
      verificationId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    await verification.save();
    
    // Send email with OTP
    await sendEmail({
      to: email,
      subject: 'Email Verification OTP',
      text: `Your OTP for email verification is: ${otp}. It will expire in 15 minutes.`
    });
    
    res.status(200).json({ 
      success: true, 
      message: 'OTP sent successfully',
      verificationId
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, verificationId } = req.body;
    
    // Find the verification record
    const verification = await Verification.findOne({
      email,
      verificationId,
      expiresAt: { $gt: new Date() }
    });
    
    if (!verification) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification session'
      });
    }
    
    // Check if OTP matches
    if (verification.otp !== otp) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP'
      });
    }
    
    // Mark as verified
    verification.verified = true;
    await verification.save();
    
    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/verify-google', async (req, res) => {
  try {
    const { email, googleId } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email already registered' 
      });
    }
    
    // Verify with Google API if needed
    // This is simplified - in a real app you'd verify the token with Google
    
    res.status(200).json({
      success: true,
      message: 'Email verified with Google'
    });
  } catch (error) {
    console.error('Google verification error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
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