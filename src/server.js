const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
require("dotenv").config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');
const authenticate = require('./middleware/auth');

// Import routes
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const conversationRoutes = require('./routes/conversations');
const userRoutes = require('./routes/users');
const volunteerRoutes = require('./routes/volunteers');
const donationRoutes = require('./routes/donations');
const blockRoutes = require('./routes/blockRoutes');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const lostItemRoutes = require('./routes/lostItems');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Connect to MongoDB
connectDB();

// Use routes
app.use('/api/admin/', adminRoutes);
app.use('/api', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/volunteer-requests', volunteerRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/users', blockRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/lost-items', lostItemRoutes);

// Add a basic route to check if server is running
app.get('/', (req, res) => {
  res.json('Server is running! sumit bhai chal gaya');
});


// Error handling
app.use(errorHandler);

// Starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});