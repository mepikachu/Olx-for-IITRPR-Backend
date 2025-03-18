const mongoose = require('mongoose');

const DonationProductSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  description: String,
  images: [{
    data: Buffer,
    contentType: String
  }],
  collectedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  donationDate: { 
    type: Date, 
    default: Date.now 
  },
  status: {
    type: String,
    enum: ['available', 'collected'],
    default: 'available'
  }
}, { timestamps: true });

module.exports = mongoose.model('DonationProduct', DonationProductSchema);