const express = require('express');
const router = express.Router();
const Product = require('../models/product');
const User = require('../models/user');
const authenticate = require('../middleware/auth');
const multer = require('multer');
const storage = multer.memoryStorage();

// CRITICAL CHANGE 1: Added file size limits and validation
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Create product endpoint (modified)
router.post('/', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    // VALIDATION: Check required fields first
    if (!req.body.name || !req.body.description || !req.body.price) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields (name, description, price)' 
      });
    }

    // VALIDATION: Ensure images are present
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least one image required' 
      });
    }

    // PROCESS IMAGES: Added size validation
    const images = [];
    for (const file of req.files) {
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: `Image ${file.originalname} exceeds 5MB limit`
        });
      }
      images.push({
        data: file.buffer,
        contentType: file.mimetype
      });
    }

    // Create product with error handling
    const newProduct = new Product({
      name: req.body.name,
      description: req.body.description,
      price: parseFloat(req.body.price),
      category: req.body.category,
      seller: req.user._id,
      images: images,
      status: 'available'
    });

    await newProduct.save();

    // Update user with error suppression
    try {
      await User.findByIdAndUpdate(req.user._id, {
        $push: { soldProducts: newProduct._id }
      });
    } catch (userUpdateError) {
      console.error('User update failed:', userUpdateError);
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId: newProduct._id
    });

  } catch (err) {
    console.error('Product Creation Error:', err);
    const errorMessage = err.name === 'ValidationError' 
      ? Object.values(err.errors).map(e => e.message).join(', ')
      : 'Server error during product creation';
      
    res.status(500).json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// Rest of the file remains same...

// Get all products
router.get('/', authenticate, async (req, res) => {
  try {
    const filter = {
      status: req.query.status || 'available',
      seller: { $ne: req.user._id } // Exclude products where user is seller
    };

    let products = await Product.find(filter)
      .populate('seller', 'userName')
      .lean();

    // Convert image buffers to base64
    products = products.map(product => ({
      ...product,
      images: product.images?.map(img => ({
        data: img.data?.toString('base64'),
        contentType: img.contentType
      })) || []
    }));

    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get product by ID
router.get('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    
    let product = await Product.findById(productId)
      .populate('seller', 'userName')
      .lean();
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Convert image buffers to base64
    product.images = product.images?.map(img => ({
      data: img.data?.toString('base64'),
      contentType: img.contentType
    })) || [];
    
    res.json({ success: true, product });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Create a new product
router.post('/', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    console.log("Received product submission:", req.body);
    console.log("Files received:", req.files.length);

    const images = req.files.map(file => ({
      data: file.buffer,
      contentType: file.mimetype
    }));

    if (!req.body.name || !req.body.description || !req.body.price || !req.body.category) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const price = parseFloat(req.body.price);
    if (isNaN(price)) {
      return res.status(400).json({ success: false, error: 'Price must be a valid number' });
    }

    const productData = {
      name: req.body.name,
      description: req.body.description,
      images: images,
      seller: req.user._id,
      price: price,
      category: req.body.category.toLowerCase()
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    req.user.soldProducts.push(newProduct._id);
    await req.user.save();

    res.status(201).json({ success: true, product: newProduct });
  } catch (err) {
    console.error("Error in POST /products:", err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Update a product
router.put('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, description } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { name, description },
      { new: true }
    );

    res.json({ 
      success: true, 
      message: 'Product updated successfully', 
      product: updatedProduct 
    });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Delete a product
router.delete('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await Product.findByIdAndDelete(productId);

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { soldProducts: productId }
    });

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
  }
});

// Check if user has made an offer
router.get('/:productId/check-offer', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const existingOffer = product.offerRequests.find(
      offer => offer.buyer.toString() === req.user._id.toString()
    );

    res.json({
      success: true,
      hasOffer: !!existingOffer,
      offerAmount: existingOffer ? existingOffer.offerPrice : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get all offers for a product
router.get('/:productId/offers', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('offerRequests.buyer', 'userName');
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, offerRequests: product.offerRequests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
