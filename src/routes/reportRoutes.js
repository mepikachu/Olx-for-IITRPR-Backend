// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const Report = require('../models/report');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

// Create new report
router.post('/', auth, async (req, res) => {
  try {
    const { reportedUserId, reason, details, includeChat, conversationId } = req.body;
    
    // Prevent self-reporting
    if (req.user.id === reportedUserId) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }
    
    const report = new Report({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      reason,
      details,
      includeChat: includeChat || false,
      conversationId: includeChat ? conversationId : null
    });
    
    await report.save();
    res.status(201).json({ 
      success: true,
      message: 'Report submitted successfully'
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error'
    });
  }
});

// routes/reportRoutes.js
// Inside the report user route
router.post('/report-user', auth, async (req, res) => {
  try {
    const { reportedUserId, reason, details, includeChat, conversationId } = req.body;
    
    // Prevent self-reporting
    if (req.user.id === reportedUserId) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }
    
    const report = new Report({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      reason,
      details,
      includeChat: includeChat || false,
      conversationId: includeChat ? conversationId : null
    });
    
    await report.save();
    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Report user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a route for admins to view conversation history
router.get('/admin/reports/:reportId/chat', [auth, isAdmin], async (req, res) => {
  try {
    const { reportId } = req.params;
    
    // Find the report
    const report = await Report.findById(reportId);
    
    if (!report || !report.includeChat || !report.conversationId) {
      return res.status(400).json({ 
        message: 'No chat history available for this report'
      });
    }
    
    // Fetch the messages for this conversation
    const messages = await Message.find({ conversation: report.conversationId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name email');
    
    res.status(200).json(messages);
  } catch (error) {
    console.error('Get report chat error:', error);
    res.status(500).json({ message: 'Server error' });
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
    
    res.status(200).json({
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Update report status
router.patch('/admin/reports/:reportId', [auth, isAdmin], async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;
    
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    report.status = status || report.status;
    if (adminNotes) report.adminNotes = adminNotes;
    
    if (status && status !== 'pending') {
      report.reviewedAt = new Date();
    }
    
    await report.save();
    res.status(200).json({ message: 'Report updated successfully', report });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;