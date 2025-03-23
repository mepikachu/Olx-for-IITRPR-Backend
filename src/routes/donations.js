const express = require('express');
const router = express.Router();
const Donations = require('../models/donation');
const authenticate = require('../middleware/auth');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get all donations
router.get('/', authenticate, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'volunteer') {
      query.status = 'available';
    } else {
      query.donatedBy = req.user._id;
    }
    const donations = await Donations.find(query)
      .populate('donatedBy', 'userName')
      .populate('collectedBy', 'userName');

    const donationsData = donations.map(donation => {
      const donationObj = donation.toObject();
      donationObj.images = (donationObj.images || []).map(img => ({
        data: img.data ? img.data.toString('base64') : null,
        contentType: img.contentType
      }));
      return donationObj;
    });

    res.json({ success: true, donations: donationsData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add a donation (by normal user)
router.post('/', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    console.log("Received donation submission:", req.body);
    console.log("Files received:", req.files.length);

    const images = req.files.map(file => ({
      data: file.buffer,
      contentType: file.mimetype
    }));

    if (!req.body.name || !req.body.description) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const donationData = {
      name: req.body.name,
      description: req.body.description,
      images: images,
      donatedBy: req.user._id,
      status: 'available'
    };

    const newDonation = new Donations(donationData);
    await newDonation.save();

    res.status(201).json({ success: true, donation: newDonation });
  } catch (err) {
    console.error("Error in POST /donations:", err);
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

    const donation = await Donations.findById(req.params.donationId);
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
    const donorsLeaderboard = await Donations.aggregate([
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

    const volunteersLeaderboard = await Donations.aggregate([
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