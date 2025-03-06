const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors({credentials: true}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// File upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Schemas
const AddressSchema = new mongoose.Schema({
  street: String,
  city: String,
  state: String,
  zipCode: String,
  country: { type: String, default: "India" }
});

const UserSchema = new mongoose.Schema({
  userName: { 
    type: String, 
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 30,
    trim: true
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
    default: 'user'
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
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  transactionDate: Date
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);

// Middleware
const authenticate = async (req, res, next) => {
  const token = req.cookies.authToken || req.headers.authorization?.split(' ')[1];
  
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Update last seen
    user.lastSeen = Date.now();
    await user.save();

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Routes
app.post('/api/register', upload.none(), async (req, res) => {
  try {
    const { userName, email, phone, password, address } = req.body;

    const newUser = new User({
      userName,
      email,
      phone,
      password,
      address: JSON.parse(address)
    });

    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.status(201).json({
      success: true,
      user: {
        id: newUser._id,
        userName: newUser.userName,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      res.status(400).json({ success: false, error: `${field} already exists` });
    } else {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
});

app.post('/api/login', upload.none(), async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }]
    }).select('+password');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        userName: user.userName,
        email: user.email,
        role: user.role,
        lastSeen: user.lastSeen
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/products', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const images = req.files.map(file => `/uploads/${file.filename}`);
    
    const productData = {
      ...req.body,
      images,
      seller: req.user._id,
      price: parseFloat(req.body.price),
      category: req.body.category.toLowerCase()
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    // Add to user's sold products
    req.user.soldProducts.push(newProduct._id);
    await req.user.save();

    res.status(201).json({
      success: true,
      product: newProduct
    });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/me', authenticate, async (req, res) => {
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

app.post('/api/logout', authenticate, async (req, res) => {
  res.clearCookie('authToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Admin Routes
app.get('/api/users', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const users = await User.find().select('-password');
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
});
