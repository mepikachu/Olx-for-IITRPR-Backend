const express = require('express');
const router = express.Router();
const ProductReport = require('../models/ProductReport');
const authenticate = require('../middleware/auth');

// Create a new report
router.post('/', authenticate, async (req, res) => {
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

// Get reports for a specific product
router.get('/product/:productId', authenticate, async (req, res) => {
  try {
    const reports = await ProductReport.find({ product: req.params.productId })
      .populate('reporter', 'userName')
      .sort('-createdAt');
    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
