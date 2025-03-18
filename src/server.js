const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
require("dotenv").config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');
const authenticate = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const conversationRoutes = require('./routes/conversations');
const userRoutes = require('./routes/users');
const volunteerRoutes = require('./routes/volunteers');
const donationRoutes = require('./routes/donations');

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
app.use('/api', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/volunteer-requests', volunteerRoutes);
app.use('/api/donations', donationRoutes);

// Error handling
app.use(errorHandler);

// Starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});