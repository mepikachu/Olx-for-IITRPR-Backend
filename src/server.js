const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();

// Enhanced Security Middleware
app.use(cors({
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database Connection with Enhanced Settings
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

// Advanced File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

// Enhanced Schemas with Indexes
const AddressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, default: "India" }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 30,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: [/^[0-9]{10}$/, 'Invalid phone number']
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'volunteer', 'user'],
    default: 'user',
    index: true
  },
  address: AddressSchema,
  soldProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  purchasedProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  registrationDate: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: 'text'
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  images: [{
    type: String,
    required: true
  }],
  category: {
    type: String,
    enum: ['electronics', 'furniture', 'books', 'clothing', 'others'],
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'reserved'],
    default: 'available'
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  transactionDate: Date
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);

// Advanced Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    let token;
    
    // Check multiple token sources
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.authToken) {
      token = req.cookies.authToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user changed password after token was issued
    if (user.passwordChangedAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        error: 'Password changed recently - Please login again'
      });
    }

    // Update last seen
    user.lastSeen = Date.now();
    await user.save();

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: err.message
    });
  }
};

// Add password changed method to User schema
UserSchema.methods.passwordChangedAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Enhanced Routes
// User Registration
app.post('/api/v1/auth/register', upload.none(), async (req, res) => {
  try {
    const { userName, email, phone, password, address } = req.body;

    // Validate input
    if (!userName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Create user
    const user = await User.create({
      userName,
      email,
      phone,
      password,
      address: JSON.parse(address)
    });

    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Set cookie
    res.cookie('authToken', token, {
      expires: new Date(
        Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict'
    });

    // Remove sensitive data
    user.password = undefined;

    res.status(201).json({
      success: true,
      token,
      data: {
        user
      }
    });

  } catch (err) {
    // Handle duplicate fields
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        success: false,
        error: `${field} already exists`
      });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        error: messages
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// User Login
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // 1) Check if identifier and password exist
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide identifier and password'
      });
    }

    // 2) Check if user exists and password is correct
    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }]
    }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect identifier or password'
      });
    }

    // 3) Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 4) Send response
    res.cookie('authToken', token, {
      expires: new Date(
        Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict'
    });

    user.password = undefined;

    res.status(200).json({
      success: true,
      token,
      data: {
        user
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Add password comparison method
UserSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Protected User Routes
app.get('/api/v1/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('soldProducts purchasedProducts')
      .select('-password');

    res.status(200).json({
      success: true,
      data: {
        user
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Update Password
app.patch('/api/v1/auth/updatePassword', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    
    // 1) Check current password
    if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // 2) Update password
    user.password = req.body.newPassword;
    user.passwordChangedAt = Date.now();
    await user.save();

    // 3) Generate new token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      token,
      data: {
        user
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Product Routes
app.post('/api/v1/products', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const images = req.files.map(file => `/uploads/${file.filename}`);
    
    const productData = {
      ...req.body,
      images,
      seller: req.user.id,
      price: parseFloat(req.body.price),
      category: req.body.category.toLowerCase()
    };

    const product = await Product.create(productData);

    // Add product to user's sold products
    await User.findByIdAndUpdate(req.user.id, {
      $push: { soldProducts: product._id }
    });

    res.status(201).json({
      success: true,
      data: {
        product
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Admin Routes
app.use('/api/v1/admin', authenticate, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized access'
    });
  }
  next();
});

app.get('/api/v1/admin/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    
    res.status(200).json({
      success: true,
      results: users.length,
      data: {
        users
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  res.status(err.statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// 404 Handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Can't find ${req.originalUrl} on this server!`
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});
