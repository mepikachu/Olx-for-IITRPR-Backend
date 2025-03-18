const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();


const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Connect to MongoDB Atlas
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  }
};
connectDB();

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
  profilePicture: {
    data: Buffer,
    contentType: String
  },
  role: {
    type: String,
    enum: ['admin', 'volunteer', 'user'],
    default: 'user'
  },
  volunteerApproved: {
    type: Boolean,
    default: false
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
  },
  // Fields for our auth-cookie
  authCookie: {
    type: String,
    default: null
  },
  authCookieCreated: {
    type: Date,
    default: null
  },
  authCookieExpires: {
    type: Date,
    default: null
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
    data: Buffer,
    contentType: String
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
  transactionDate: Date,
  offerRequests: [{
    offerPrice: Number,
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Conversation Schema: Only two participants allowed
const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

ConversationSchema.index({ participants: 1 });
ConversationSchema.path('participants').validate(function (value) {
  return value.length === 2;
}, 'A conversation must have exactly two participants.');

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Conversation = mongoose.model('Conversation', ConversationSchema);

// Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    // Check for authCookie in cookies, headers or body
    const authCookie = req.cookies?.authCookie || req.headers['auth-cookie'] || req.body.authCookie;
    if (!authCookie) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No auth cookie provided' });
    }
    const user = await User.findOne({ authCookie: authCookie });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid auth cookie' });
    }
    if (user.authCookieExpires < Date.now()) {
      return res.status(401).json({ success: false, error: 'Auth cookie expired. Please log in again.' });
    }
    // Update lastSeen timestamp
    user.lastSeen = Date.now();
    await user.save();
    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Login route: Supports both credential-based and direct authCookie login
app.post('/api/login', upload.none(), async (req, res) => {
  try {
    const { identifier, password, authCookie: providedAuthCookie } = req.body;

    // If authCookie is provided, try to log in using it directly
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
            role: userByCookie.role  // admin, volunteer, or user
          }
        });
      } else {
        return res.status(401).json({ success: false, error: 'Invalid or expired auth cookie' });
      }
    }

    // Otherwise, proceed with credential-based login
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Identifier and password are required' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { userName: identifier }]
    }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Generate a random 512-bit (64 bytes) auth cookie
    const newAuthCookie = crypto.randomBytes(64).toString('hex');
    user.authCookie = newAuthCookie;
    user.authCookieCreated = new Date();
    user.authCookieExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Valid for 30 days
    await user.save();

    // Optionally, set it as an HTTP-only cookie
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
        role: user.role  // admin, volunteer, or user
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: err.message 
    });
  }
});

// Registration route (creates a user and optionally sets an auth cookie)
app.post('/api/register', upload.single('profilePicture'), async (req, res) => {
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
      // If role is 'volunteer', mark volunteerApproved false for later admin approval.
      role: role === 'volunteer' ? 'volunteer' : 'user',
      volunteerApproved: role === 'volunteer' ? false : true
    });

    // If a profile picture was attached, store it.
    if (req.file) {
      newUser.profilePicture = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    await newUser.save();

    // Generate and store auth cookie
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
    
    return res.status(201).json({
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
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: Object.values(err.errors).map(val => val.message) });
    }
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Protected route for product creation using memory storage
app.post('/api/products', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    console.log("Received product submission:", req.body);
    console.log("Files received:", req.files.length);

    // Map uploaded files to an array of { data, contentType } objects
    const images = req.files.map(file => ({
      data: file.buffer,
      contentType: file.mimetype
    }));

    // Ensure required fields are provided
    if (!req.body.name || !req.body.description || !req.body.price || !req.body.category) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Parse and validate price
    const price = parseFloat(req.body.price);
    if (isNaN(price)) {
      return res.status(400).json({ success: false, error: 'Price must be a valid number' });
    }

    const productData = {
      name: req.body.name,
      description: req.body.description,
      images: images, // Directly store the image buffers
      seller: req.user._id,
      price: price,
      category: req.body.category.toLowerCase()
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    // Update seller's soldProducts array
    req.user.soldProducts.push(newProduct._id);
    await req.user.save();

    res.status(201).json({ success: true, product: newProduct });
  } catch (err) {
    console.error("Error in POST /api/products:", err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

app.get('/api/products', authenticate, async (req, res) => {
  try {
    const filter = {
      status: req.query.status || 'available',
      seller: { $ne: req.user._id } // Exclude products where user is seller
    };

    let products = await Product.find(filter)
      .populate('seller', 'userName')
      .lean();

    // Convert image buffers to base64
    products = products.map(product => ({
      ...product,
      images: product.images?.map(img => ({
        data: img.data?.toString('base64'),
        contentType: img.contentType
      })) || []
    }));

    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Create or retrieve a conversation between two users
app.post('/api/conversations', authenticate, async (req, res) => {
  try {
    const { participantId, productPreview, firstMessage } = req.body;
    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }
    // Ensure two participants are involved.
    const participants = [req.user._id, participantId].sort();
    let conversation = await Conversation.findOne({
      participants: { $all: participants }
    });
  
    if (!conversation) {
      conversation = new Conversation({ participants });
      
      // If product preview is provided, add a product reply message.
      if (productPreview && firstMessage) {
        const productReplyMessage = {
          type: 'product_reply', // marker for client to render specially
          productId: productPreview.productId,
          productName: productPreview.productName,
          price: productPreview.price,
          image: productPreview.image,
          createdAt: new Date(),
        };
        const userMessage = {
          sender: req.user._id,
          text: firstMessage,
          createdAt: new Date()
        };
        conversation.messages.push(productReplyMessage);
        conversation.messages.push(userMessage);
      }
    }
  
    await conversation.save();
  
    res.json({ success: true, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Get all conversations that include the authenticated user
app.get('/api/conversations', authenticate, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .populate('participants', 'userName')
      .populate('messages.sender', 'userName')
      .lean();

    res.json({ success: true, conversations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Get conversation details including messages by conversationId
app.get('/api/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants', 'userName')
      .populate('messages.sender', 'userName');
    
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    // Ensure the user is a participant
    if (!conversation.participants.map(p => p._id.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    res.json({ success: true, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Send a message in a conversation.
app.post('/api/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }
    
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    // Ensure the user is a participant
    if (!conversation.participants.map(p => p.toString()).includes(req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const message = {
      sender: req.user._id,
      text,
      createdAt: new Date()
    };
    
    conversation.messages.push(message);
    await conversation.save();
    
    res.json({ success: true, message: 'Message sent', conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Get current user details
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

// Logout route: clear auth cookie and remove it from the user document
app.post('/api/logout', authenticate, async (req, res) => {
  req.user.authCookie = null;
  req.user.authCookieCreated = null;
  req.user.authCookieExpires = null;
  await req.user.save();

  res.clearCookie('authCookie');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Admin route to get all users (requires admin role)
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

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Create or update an offer for a product
app.post('/api/offers', authenticate, async (req, res) => {
  try {
    const { productId, offerPrice } = req.body;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Check if user already has an offer
    const existingIndex = product.offerRequests.findIndex(
      offer => offer.buyer.toString() === req.user._id.toString()
    );

    if (existingIndex !== -1) {
      // Update existing offer
      product.offerRequests[existingIndex].offerPrice = offerPrice;
      product.offerRequests[existingIndex].updatedAt = new Date();
    } else {
      // Create new offer
      product.offerRequests.push({
        buyer: req.user._id,
        offerPrice,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    await product.save();
    res.json({ 
      success: true,
      hasOffer: true,
      offerAmount: offerPrice
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Endpoint to retrieve all offers for a product (for the seller)
app.get('/api/products/:productId/offers', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('offerRequests.buyer', 'userName');
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, offerRequests: product.offerRequests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Endpoints to accept or decline an offer
app.post('/api/offers/:offerId/accept', authenticate, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID required' });
    }
    // Only seller can accept an offer.
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    // Update product status and/or record accepted offer as needed.
    // (This example simply returns success.)
    res.json({ success: true, message: 'Offer accepted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/offers/:offerId/decline', authenticate, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID required' });
    }
    // Only seller can decline an offer.
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    // Remove the offer from offerRequests.
    product.offerRequests = product.offerRequests.filter(offer => offer._id.toString() !== req.params.offerId);
    await product.save();
    res.json({ success: true, message: 'Offer declined' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add this endpoint to check if current user has made an offer
app.get('/api/products/:productId/check-offer', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Check if user has already made an offer
    const existingOffer = product.offerRequests.find(
      offer => offer.buyer.toString() === req.user._id.toString()
    );

    res.json({
      success: true,
      hasOffer: !!existingOffer,
      offerAmount: existingOffer ? existingOffer.offerPrice : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Endpoint for admin to get pending volunteer requests
app.get('/api/volunteer-requests', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const requests = await User.find({ role: 'volunteer', volunteerApproved: false }).select('-password');
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Endpoint to approve a volunteer request
app.post('/api/volunteer-requests/:userId/approve', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const user = await User.findById(req.params.userId);
    if (!user || user.role !== 'volunteer') {
      return res.status(404).json({ success: false, error: 'Volunteer not found' });
    }
    user.volunteerApproved = true;
    await user.save();
    res.json({ success: true, message: 'Volunteer approved' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Endpoint to reject a volunteer request (optional)
app.post('/api/volunteer-requests/:userId/reject', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    // For rejection, you might delete the volunteer record or set a flag.
    await User.findByIdAndDelete(req.params.userId);
    res.json({ success: true, message: 'Volunteer request rejected and user removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
