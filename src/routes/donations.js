const express = require('express');
const router = express.Router();
const DonationProduct = require('../models/donation');
const authenticate = require('../middleware/auth');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get all donations for the current volunteer
router.get('/', authenticate, async (req, res) => {
  try {
    const donations = await DonationProduct.find({ collectedBy: req.user._id });
    res.json({ success: true, donations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add a donation product (collected by the volunteer)
router.post('/', authenticate, upload.array('images'), async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({ 
        success: false, 
        error: 'Volunteer approval pending. Action not allowed.' 
      });
    }

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const donation = new DonationProduct({
      name,
      description,
      collectedBy: req.user._id,
    });

    if (req.files && req.files.length > 0) {
      donation.images = req.files.map(file => ({
        data: file.buffer,
        contentType: file.mimetype
      }));
    }

    await donation.save();
    res.status(201).json({ success: true, donation });
  } catch (err) {
    console.error('Donation submission error:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

module.exports = router;