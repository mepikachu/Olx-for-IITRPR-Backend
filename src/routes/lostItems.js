const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const LostItem = require('../models/lostItem');

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5
  }
});

// Create a new lost item
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Convert images to base64
    const images = req.files.map(file => ({
      data: file.buffer.toString('base64'),
      contentType: file.mimetype
    }));

    const lostItem = new LostItem({
      name,
      description,
      images,
      user: req.user._id
    });

    await lostItem.save();

    res.status(201).json({
      success: true,
      item: lostItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all lost items
router.get('/', auth, async (req, res) => {
  try {
    const items = await LostItem.find()
      .populate('user', 'userName email')
      .sort('-createdAt');

    res.json({
      success: true,
      items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's lost items
router.get('/my-items', auth, async (req, res) => {
  try {
    const items = await LostItem.find({ user: req.user._id })
      .sort('-createdAt');

    res.json({
      success: true,
      items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update lost item status
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isResolved } = req.body;

    const item = await LostItem.findOne({
      _id: id,
      user: req.user._id
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found or unauthorized'
      });
    }

    if (status) item.status = status;
    if (typeof isResolved === 'boolean') item.isResolved = isResolved;

    await item.save();

    res.json({
      success: true,
      item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete lost item
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await LostItem.findOneAndDelete({
      _id: id,
      user: req.user._id
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
