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
    const { identifier, password } = req.body;

    // 2) Otherwise we need identifier + password
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Identifier and password are required' });
    }

    // 3) Look up the user by email or userName
    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }]
    }).select('+password userName email role authCookie authCookieExpires');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // 4) Verify the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    let authCookieToUse;
    if (user.authCookie && user.authCookieExpires >= Date.now()) {
      authCookieToUse = user.authCookie;
    } else {
      authCookieToUse = crypto.randomBytes(64).toString('hex');
      user.authCookie = authCookieToUse;
      user.authCookieCreated = new Date();
      user.authCookieExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await user.save();
    }

    // Set it as an HTTP‑only cookie
    res.cookie('authCookie', authCookieToUse, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: "Login successful",
      authCookie: authCookieToUse,
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

router.post('/send-register-otp', async (req, res) => {
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

    // 2) Remove any existing OTPs for this email
    await Verification.deleteMany({ email }); 
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Generate a verification ID
    const verificationId = crypto.randomBytes(64).toString('hex');
    
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

router.post('/send-reset-otp', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Useranem or Email is required' });
    }

    // Make sure the user exists
    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }]
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'No account with that email' });
    }

    const email = user.email;

    // Delete any existing reset OTPs for this email
    await Verification.deleteMany({ email });

    // Generate 6‑digit OTP + verificationId
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationId = crypto.randomBytes(32).toString('hex');

    // Save to Verification collection (expires in 15m)
    await new Verification({
      email,
      otp,
      verificationId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    }).save();

    // Email the OTP
    await sendEmail({
      to: email,
      subject: 'Password Reset OTP',
      text: `Your password reset OTP is: ${otp}. It expires in 15 minutes.`
    });

    res.status(200).json({
      success: true,
      message: 'OTP sent for password reset',
      verificationId
    });
  } catch (err) {
    console.error('send-reset-otp error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { otp, verificationId } = req.body;
    
    // Find the verification record
    const verification = await Verification.findOne({
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
    const { verificationId, userName, phone, password, address, role } = req.body;
    if (!verificationId || !userName || !phone || !password) {
      return res.status(400).json({ success: false, error: 'All required fields missing' });
    }

    const verification = await Verification.findOne({
      verificationId,
      expiresAt: { $gt: new Date() }
    });

    if (!verification || !verification.verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification session'
      });
    }

    const email = verification.email;

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

    await Verification.deleteMany({ email }); 
    
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

// Reset password route
router.post('/reset-password', async (req, res) => {
  try {
    const { verificationId, newPassword } = req.body;
    if (!verificationId || !newPassword) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    // Find a matching, unexpired verification record
    const verification = await Verification.findOne({
      verificationId,
      expiresAt: { $gt: new Date() }
    });

    if (!verification || !verification.verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification session'
      });
    }

    const email = verification.email;    

    // Update the user's password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    user.password = newPassword;
    await user.save();

    // Delete all reset OTPs for this email
    await Verification.deleteMany({ email });

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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