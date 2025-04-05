// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const UserReport = require('../models/UserReport');
const ProductReport = require('../models/ProductReport');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const mongoose = require('mongoose');

// Submit a user report
router.post('/user', auth, async (req, res) => {
  try {
    console.log('Report submission received:', req.body);
    const { reportedUserId, reason, details, includeChat, conversationId } = req.body;

    // Basic validation
    if (!reportedUserId || !reason) {
      console.log('Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Create and save the report
    const report = new UserReport({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      reason,
      details: details || '',
      includeChat: includeChat || false,
      conversationId: includeChat && conversationId ? conversationId : null,
      status: 'pending'
    });

    console.log('Saving report:', report);
    await report.save();
    console.log('Report saved successfully');
    
    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully'
    });
  } catch (error) {
    console.error('Create report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Submit a product report
router.post('/product', auth, async (req, res) => {
  try {
    const { productId, reason, description } = req.body;
    const report = new ProductReport({
      product: productId,
      reporter: req.user._id,
      reason,
      description
    });
    await report.save();
    res.status(201).json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
