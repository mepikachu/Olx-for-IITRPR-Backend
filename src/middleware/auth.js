const User = require('../models/user');

const authenticate = async (req, res, next) => {
  try {
    const authCookie = req.cookies?.authCookie || req.headers['auth-cookie'] || req.body.authCookie || req.headers['authCookie'];
    if (!authCookie) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No auth cookie provided' 
      });
    }

    const user = await User.findOne({ authCookie: authCookie });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: Invalid auth cookie' 
      });
    }

    if (user.authCookieExpires < Date.now()) {
      return res.status(401).json({ 
        success: false, 
        error: 'Auth cookie expired. Please log in again.' 
      });
    }

    // Update lastSeen timestamp
    user.lastSeen = Date.now();
    await user.save();
    req.user = user;

    if (user.isBlocked){
      return res.status(403).json({
        success: false,
        error: 'User account is blocked by admin.',
        blockedAt: user.blockedAt,
        blockedReason: user.blockedReason
      })
    }

    // If user's role is volunteer_pending and they are trying to access an endpoint 
    // other than allowed ones, then deny access.
    const allowedForPendingVolunteer = ['/api/me', '/api/logout'];
    if (user.role === 'volunteer_pending' &&
        !allowedForPendingVolunteer.some(path => req.originalUrl.startsWith(path))) {
      return res.status(403).json({
        success: false,
        error: 'Volunteer approval pending. Access denied except for profile details.'
      });
    }
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

module.exports = authenticate;