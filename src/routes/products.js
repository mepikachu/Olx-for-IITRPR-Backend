const express = require('express');
const router = express.Router();
const Product = require('../models/product');
const User = require('../models/user');
const authenticate = require('../middleware/auth');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const Notification = require('../models/notification');

// Add this function at the top of the file
async function createNotification(recipientId, type, productId, message) {
  try {
    const notification = new Notification({
      recipient: recipientId,
      type,
      productId,
      message
    });
    await notification.save();
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

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
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Please upload at least one image' });
    }

    const images = req.files.map(file => ({
      data: file.buffer,
      contentType: file.mimetype
    }));

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

    await User.findByIdAndUpdate(req.user._id, {
      $push: { soldProducts: newProduct._id }
    });

    res.status(201).json({ 
      success: true, 
      message: 'Product created successfully',
      product: newProduct 
    });

  } catch (err) {
    console.error('Product creation error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Error creating product'
    });
  }
});

// Update a product
router.put('/:productId', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const { productId } = req.params;
    const { description, price, existingImages } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Parse existing images JSON if provided
    let updatedImages = [];
    if (existingImages) {
      updatedImages = JSON.parse(existingImages).map(img => ({
        data: Buffer.from(img.data, 'base64'),
        contentType: img.contentType
      }));
    }

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        data: file.buffer,
        contentType: file.mimetype
      }));
      updatedImages = [...updatedImages, ...newImages];
    }

    // Validate at least one image
    if (updatedImages.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Product must have at least one image' 
      });
    }

    // Validate price if provided
    let updatedPrice = product.price;
    if (price) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Price must be a valid number' 
        });
      }
      updatedPrice = parsedPrice;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { 
        description: description || product.description,
        price: updatedPrice,
        images: updatedImages
      },
      { new: true }
    );

    await createNotification(
      product.seller,
      'product_update',
      productId,
      `Your product "${product.name}" has been updated`
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

// Accept an offer
router.post('/offers/:offerId/accept', authenticate, async (req, res) => {
  try {
    const { productId } = req.body;
    const { offerId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const offer = product.offerRequests.id(offerId);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Update product status and buyer
    product.status = 'sold';
    product.buyer = offer.buyer;
    product.transactionDate = new Date();

    // Clear all offers as the product is now sold
    product.offerRequests = [];

    await product.save();

    await createNotification(
      offer.buyer,
      'offer_response',
      productId,
      `Your offer for "${product.name}" has been accepted`
    );

    res.json({ success: true, message: 'Offer accepted successfully' });
  } catch (err) {
    console.error('Error accepting offer:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Reject an offer
router.post('/offers/:offerId/decline', authenticate, async (req, res) => {
  try {
    const { productId } = req.body;
    const { offerId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Remove the specific offer
    product.offerRequests = product.offerRequests.filter(
      offer => offer._id.toString() !== offerId
    );

    await product.save();

    await createNotification(
      offer.buyer,
      'offer_response',
      productId,
      `Your offer for "${product.name}" has been declined`
    );

    res.json({ success: true, message: 'Offer rejected successfully' });
  } catch (err) {
    console.error('Error rejecting offer:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Make an offer
router.post('/:productId/make-offer', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { offerPrice } = req.body;

    if (!offerPrice) {
      return res.status(400).json({ success: false, error: 'Offer price is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (product.seller.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot make offer on your own product' });
    }

    if (product.status !== 'available') {
      return res.status(400).json({ success: false, error: 'Product is not available' });
    }

    // Check if user already has an offer
    const existingOffer = product.offerRequests.find(
      offer => offer.buyer.toString() === req.user._id.toString()
    );

    if (existingOffer) {
      existingOffer.offerPrice = offerPrice;
    } else {
      product.offerRequests.push({
        offerPrice,
        buyer: req.user._id
      });
    }

    await product.save();

    // Create notification for seller
    await createNotification(
      product.seller,
      'offer',
      productId,
      `New offer of ₹${offerPrice} received for "${product.name}"`
    );

    res.json({ success: true, message: 'Offer made successfully' });
  } catch (err) {
    console.error('Error making offer:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
