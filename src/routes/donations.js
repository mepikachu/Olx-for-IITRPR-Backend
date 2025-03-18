const express = require('express');
const router = express.Router();
const DonationProduct = require('../models/donation');
const authenticate = require('../middleware/auth');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get all donations
router.get('/', authenticate, async (req, res) => {
  try {
    let query = {};
    
    // If user is a volunteer, show uncollected donations
    if (req.user.role === 'volunteer') {
      query.status = 'available';
    } else {
      // For normal users, show their donations
      query.donatedBy = req.user._id;
    }

    const donations = await DonationProduct.find(query)
      .populate('donatedBy', 'userName')
      .populate('collectedBy', 'userName');
    
    res.json({ success: true, donations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add a donation (by normal user)
router.post('/', authenticate, upload.array('images'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const donation = new DonationProduct({
      name,
      description,
      donatedBy: req.user._id,
      status: 'available'
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

// Collect a donation (by volunteer)
router.post('/:donationId/collect', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({
        success: false,
        error: 'Only volunteers can collect donations'
      });
    }

    const donation = await DonationProduct.findById(req.params.donationId);
    if (!donation) {
      return res.status(404).json({ success: false, error: 'Donation not found' });
    }

    if (donation.status !== 'available') {
      return res.status(400).json({ success: false, error: 'Donation already collected' });
    }

    donation.collectedBy = req.user._id;
    donation.status = 'collected';
    await donation.save();

    res.json({ success: true, donation });
  } catch (err) {
    console.error('Collection error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get donation leaderboard
router.get('/leaderboard', authenticate, async (req, res) => {
  try {
    const donorsLeaderboard = await DonationProduct.aggregate([
      {
        $group: {
          _id: '$donatedBy',
          totalDonations: { $count: {} }
        }
      },
      { $sort: { totalDonations: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $project: {
          _id: 1,
          totalDonations: 1,
          userName: { $arrayElemAt: ['$userDetails.userName', 0] },
          role: 'donor'
        }
      }
    ]);

    const volunteersLeaderboard = await DonationProduct.aggregate([
      {
        $match: { status: 'collected' }
      },
      {
        $group: {
          _id: '$collectedBy',
          totalCollections: { $count: {} }
        }
      },
      { $sort: { totalCollections: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $project: {
          _id: 1,
          totalDonations: '$totalCollections',
          userName: { $arrayElemAt: ['$userDetails.userName', 0] },
          role: 'volunteer'
        }
      }
    ]);

    res.json({ 
      success: true, 
      donors: donorsLeaderboard,
      volunteers: volunteersLeaderboard
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;