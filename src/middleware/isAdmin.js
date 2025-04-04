const User = require('../models/user');

const isAdmin = async (req, res, next) => {
  try {
    // Check if user is authenticated first
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Check if authenticated user is an admin
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ success: false, message: 'Server error during admin authentication' });
  }
};

module.exports = isAdmin;
