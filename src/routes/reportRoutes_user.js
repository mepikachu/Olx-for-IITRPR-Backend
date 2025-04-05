// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const Report = require('../models/report_user');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const mongoose = require('mongoose');

// Submit a report
router.post('/', auth, async (req, res) => {
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
    const report = new Report({
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

// Admin: Get all reports (with pagination)
router.get('/admin/reports', [auth, isAdmin], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || 'pending';
    const skip = (page - 1) * limit;
    
    const reports = await Report.find({ status })
      .populate('reporter', 'name email')
      .populate('reportedUser', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await Report.countDocuments({ status });
    
    return res.status(200).json({
      success: true,
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message 
    });
  }
});

// Admin: Update report status
router.patch('/admin/reports/:reportId', [auth, isAdmin], async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ 
        success: false,
        message: 'Report not found' 
      });
    }

    report.status = status || report.status;
    if (adminNotes) report.adminNotes = adminNotes;
    
    if (status && status !== 'pending') {
      report.reviewedAt = new Date();
    }

    await report.save();
    
    return res.status(200).json({ 
      success: true,
      message: 'Report updated successfully', 
      report 
    });
  } catch (error) {
    console.error('Update report error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message 
    });
  }
});

// Admin: Get chat history for a report
router.get('/admin/reports/:reportId/chat', [auth, isAdmin], async (req, res) => {
  try {
    const { reportId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    // Find the report
    const report = await Report.findById(reportId);
    if (!report || !report.includeChat || !report.conversationId) {
      return res.status(400).json({
        success: false,
        message: 'No chat history available for this report'
      });
    }

    // Import Message model
    const Message = require('../models/message');
    
    // Fetch the messages for this conversation
    const messages = await Message.find({ conversation: report.conversationId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name email');
      
    return res.status(200).json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Get report chat error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message 
    });
  }
});

module.exports = router;
