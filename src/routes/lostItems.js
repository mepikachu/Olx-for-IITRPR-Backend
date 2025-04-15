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
    const { name, description, lastSeenLocation } = req.body;
    
    // Convert images to base64
    const images = req.files.map(file => ({
      data: file.buffer.toString('base64'),
      contentType: file.mimetype
    }));

    const lostItem = new LostItem({
      name,
      description,
      lastSeenLocation,
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

// GET all lost items (no images)
router.get('/', auth, async (req, res) => {
  try {
    const items = await LostItem.find()
      .select('-images')
      .populate('user', 'userName email')
      .sort('-createdAt')
      .lean();
    res.json({ success: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET my-items (no images)
router.get('/my-items', auth, async (req, res) => {
  try {
    const items = await LostItem.find({ user: req.user._id })
      .select('-images')
      .sort('-createdAt')
      .lean();
    res.json({ success: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get a single lost item by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)
      .select('-images')
      .populate('user', 'userName email')
      .lean();

    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    
    res.json({ success: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET main image only
router.get('/:id/main_image', auth, async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)
      .select('+images')
      .lean();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    const numImages = (item.images || []).length;
    item.images = item.images?.map(img => ({
      data: img.data?.toString('base64'),   
      contentType: img.contentType
    })) || [];

    res.json({ success: true, image: item.images[0], numImages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET all images
router.get('/:id/images', auth, async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)
      .select('+images')
      .lean();

    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    item.images = item.images?.map(img => ({
      data: img.data?.toString('base64'),   
      contentType: img.contentType
    })) || [];

    res.json({ success: true, images: item.images });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Update lost item status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Use findByIdAndUpdate instead of findOne to avoid validation of other fields
    const item = await LostItem.findByIdAndUpdate(
      id,
      { $set: { status: status } },
      { 
        new: true,  // Return updated document
        runValidators: false  // Skip validation since we're only updating status
      }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found or unauthorized'
      });
    }

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

// Update lost item status and resolution
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
