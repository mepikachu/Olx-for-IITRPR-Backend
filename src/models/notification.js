const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  notificationId: {
    type: Number,
    default: 1
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'offer_accepted', 
      'offer_rejected', 
      'product_updated', 
      'offer_received',
      'report_reviewed',
      'user_blocked',
      'user_unblocked',
      'product_deleted', 
      'warnings_received'
    ],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  offerId: {
   type: mongoose.Schema.Types.ObjectId,
   ref: 'Offer' 
  },
  reportId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

notificationSchema.pre('save', async function(next) {
  if (this.isNew) {
    const lastNotification = await this.constructor.findOne(
      { userId: this.userId },
      { notificationId: 1 }
    ).sort({ notificationId: -1 });

    if (lastNotification) {
      this.notificationId = lastNotification.notificationId + 1;
    }
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
