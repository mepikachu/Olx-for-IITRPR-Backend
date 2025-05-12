const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const isAdmin = require('../middleware/isAdmin');
const authenticate = require('../middleware/auth');

// Import your models
const User = require('../models/user');
const Product = require('../models/product');
const Donation = require('../models/donation');
const LostItem = require('../models/lostItem');
const UserReport = require('../models/UserReport');
const ProductReport = require('../models/ProductReport')
const Conversation = require('../models/conversation');
const Notification = require('../models/notification');
const BlockList = require('../models/blockList');
const Verification = require('../models/verification');

// Apply isAdmin middleware to all routes
router.use(authenticate, isAdmin);

/*** DASHBOARD DATA ROUTES ***/

// Get dashboard overview data
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Convert string dates to Date objects if provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Set start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Get counts for all major entities
    const [
      totalUsers,
      newUsers,
      totalProducts,
      newProducts,
      soldProducts,
      totalDonations,
      newDonations,
      pendingUserReports,
      pendingProductReports
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ registrationDate: { $gte: start, $lte: end } }),
      Product.countDocuments(),
      Product.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Product.countDocuments({ status: 'sold' }),
      Donation.countDocuments(),
      Donation.countDocuments({ donationDate: { $gte: start, $lte: end } }),
      UserReport.countDocuments({ status: 'pending' }),
      ProductReport.countDocuments({ status: 'pending' })
    ]);
    
    // Total pending reports
    const pendingReports = pendingUserReports + pendingProductReports;
    
    // Get active users (users who have been seen in the last 30 days)
    const activeUsers = await User.countDocuments({
      lastSeen: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    // Get user growth data (monthly registrations for the past 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const userGrowthData = await User.aggregate([
      {
        $match: { registrationDate: { $gte: twelveMonthsAgo } }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$registrationDate" },
            month: { $month: "$registrationDate" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format user growth data for the frontend
    const formattedUserGrowth = userGrowthData.map(item => ({
      month: item._id.month,
      count: item.count
    }));
    
    // Get product category distribution
    const categoryDistribution = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Format category distribution for the frontend
    const formattedCategoryDistribution = categoryDistribution.map(category => ({
      category: category._id,
      count: category.count
    }));
    
    // Get recent activity
    const recentUsersPromise = User.find()
      .sort({ registrationDate: -1 })
      .limit(3)
      .select('userName registrationDate');
      
    const recentProductsPromise = Product.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('seller', 'userName')
      .select('name seller createdAt');
      
    const recentSalesPromise = Product.find({ status: 'sold' })
      .sort({ transactionDate: -1 })
      .limit(3)
      .populate('seller', 'userName')
      .populate('buyer', 'userName')
      .select('name seller buyer transactionDate');
      
    const recentDonationsPromise = Donation.find()
      .sort({ donationDate: -1 })
      .limit(3)
      .populate('donatedBy', 'userName')
      .select('name donatedBy donationDate');
      
    const recentUserReportsPromise = UserReport.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('reporter', 'userName')
      .select('reason reporter createdAt');

    const recentProductReportsPromise = ProductReport.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('reporter', 'userName')
      .select('reason reporter createdAt');
    
    const [recentUsers, recentProducts, recentSales, recentDonations, recentUserReports, recentProductReports] = 
      await Promise.all([
        recentUsersPromise,
        recentProductsPromise,
        recentSalesPromise,
        recentDonationsPromise,
        recentUserReportsPromise,
        recentProductReportsPromise
      ]);
    
    // Combine user and product reports
    const recentReports = [...recentUserReports, ...recentProductReports]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3);
    
    // Format recent activity
    const recentActivity = [
      ...recentUsers.map(user => ({
        type: 'New User',
        user: user.userName,
        time: user.registrationDate,
        details: `New user registered`
      })),
      ...recentProducts.map(product => ({
        type: 'New Listing',
        user: product.seller.userName,
        time: product.createdAt,
        details: `Listed: ${product.name}`
      })),
      ...recentSales.map(sale => ({
        type: 'Sale',
        user: sale.seller.userName,
        time: sale.transactionDate,
        details: `Sold: ${sale.name} to ${sale.buyer.userName}`
      })),
      ...recentDonations.map(donation => ({
        type: 'Donation',
        user: donation.donatedBy.userName,
        time: donation.donationDate,
        details: `Donated: ${donation.name}`
      })),
      ...recentReports.map(report => ({
        type: 'Report',
        user: report.reporter.userName,
        time: report.createdAt,
        details: `Reason: ${report.reason}`
      }))
    ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);
    
    res.status(200).json({
      success: true,
      overview: {
        totalUsers,
        newUsers,
        activeUsers,
        totalProducts,
        newProducts,
        soldProducts,
        totalDonations,
        pendingReports,
        userGrowthData: formattedUserGrowth,
        categoryDistribution: formattedCategoryDistribution,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ success: false, message: 'Server error fetching dashboard data' });
  }
});

// Get user analytics
router.get('/users/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Convert string dates to Date objects if provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Set start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Get user counts
    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments({ 
      registrationDate: { $gte: start, $lte: end } 
    });
    
    // Get active/inactive users
    const activeUsers = await User.countDocuments({
      lastSeen: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    const inactiveUsers = totalUsers - activeUsers;
    
    // Get user growth over time
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const userGrowth = await User.aggregate([
      {
        $match: { registrationDate: { $gte: twelveMonthsAgo } }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$registrationDate" },
            month: { $month: "$registrationDate" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format user growth data
    const formattedUserGrowth = userGrowth.map(item => ({
      month: item._id.month,
      count: item.count
    }));
    
    // Get user activity by hour (based on lastSeen)
    const userActivity = await User.aggregate([
      {
        $match: {
          lastSeen: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $hour: "$lastSeen" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    // Format hourly activity - ensure all 24 hours are represented
    const formattedUserActivity = Array.from({ length: 24 }, (_, i) => {
      const hourData = userActivity.find(h => h._id === i);
      return {
        hour: i,
        count: hourData ? hourData.count : 0
      };
    });
    
    // Get most active users (based on products listed and purchased)
    const mostActiveUsers = await User.aggregate([
      {
        $project: {
          userName: 1,
          activity: { 
            $add: [
              { $size: "$soldProducts" }, 
              { $size: "$purchasedProducts" }
            ] 
          },
          soldProducts: { $size: "$soldProducts" },
          purchasedProducts: { $size: "$purchasedProducts" }
        }
      },
      { $sort: { activity: -1 } },
      { $limit: 10 }
    ]);
    
    // Format most active users
    const formattedMostActiveUsers = mostActiveUsers.map(user => ({
      userId: user.userName,
      activity: user.activity,
      listings: user.soldProducts,
      purchases: user.purchasedProducts
    }));
    
    // Get user engagement breakdown (simplified calculation)
    const highlyEngaged = Math.round(activeUsers * 0.25); // Top 25%
    const moderatelyEngaged = Math.round(activeUsers * 0.50); // Middle 50%
    const lowEngagement = totalUsers - highlyEngaged - moderatelyEngaged;
    
    // Get user role distribution
    const roleDistribution = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format role distribution
    const formattedRoleDistribution = roleDistribution.map(role => ({
      role: role._id,
      count: role.count
    }));
    
    res.status(200).json({
      success: true,
      users: {
        totalUsers,
        newUsers,
        activeUsers,
        inactiveUsers,
        userGrowth: formattedUserGrowth,
        userActivity: formattedUserActivity,
        mostActiveUsers: formattedMostActiveUsers,
        userEngagement: {
          highlyEngaged,
          moderatelyEngaged,
          lowEngagement
        },
        roleDistribution: formattedRoleDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user statistics' });
  }
});

// Get product analytics
router.get('/products/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Convert string dates to Date objects if provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Set start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Get product counts
    const totalProducts = await Product.countDocuments();
    const newProducts = await Product.countDocuments({ 
      createdAt: { $gte: start, $lte: end } 
    });
    const soldProducts = await Product.countDocuments({ status: 'sold' });
    const activeListings = await Product.countDocuments({ status: 'available' });
    
    // Calculate average time to sell
    const timeToSellData = await Product.aggregate([
      {
        $match: {
          status: 'sold',
          transactionDate: { $exists: true }
        }
      },
      {
        $project: {
          timeToSell: {
            $divide: [
              { $subtract: ["$transactionDate", "$createdAt"] },
              1000 * 60 * 60 * 24 // Convert ms to days
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgTimeToSell: { $avg: "$timeToSell" }
        }
      }
    ]);
    
    const averageTimeToSell = timeToSellData.length > 0 
      ? Math.round(timeToSellData[0].avgTimeToSell * 10) / 10 
      : 0;
    
    // Calculate average price
    const avgPriceData = await Product.aggregate([
      {
        $group: {
          _id: null,
          avgPrice: { $avg: "$price" }
        }
      }
    ]);
    
    const averagePrice = avgPriceData.length > 0 
      ? Math.round(avgPriceData[0].avgPrice) 
      : 0;
    
    // Get category distribution
    const categoryDistribution = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Format category distribution
    const formattedCategoryDistribution = categoryDistribution.map(cat => ({
      category: cat._id,
      count: cat.count
    }));
    
    // Get price range distribution
    const priceRanges = [
      { min: 0, max: 500, range: '₹0-500' },
      { min: 501, max: 1000, range: '₹501-1000' },
      { min: 1001, max: 2000, range: '₹1001-2000' },
      { min: 2001, max: 5000, range: '₹2001-5000' },
      { min: 5001, max: Number.MAX_SAFE_INTEGER, range: '₹5001+' }
    ];
    
    const priceRangePromises = priceRanges.map(async range => {
      const count = await Product.countDocuments({
        price: { $gte: range.min, $lte: range.max }
      });
      return { range: range.range, count };
    });
    
    const priceRangeDistribution = await Promise.all(priceRangePromises);
    
    // Get monthly sales data
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const monthlySales = await Product.aggregate([
      {
        $match: {
          status: 'sold',
          transactionDate: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$transactionDate" },
            month: { $month: "$transactionDate" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format monthly sales data
    const formattedMonthlySales = monthlySales.map(item => ({
      month: item._id.month,
      count: item.count
    }));
    
    // Get top selling categories (categories with highest % of sold items)
    const topSellingCategories = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          total: { $sum: 1 },
          sold: {
            $sum: {
              $cond: [{ $eq: ["$status", "sold"] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          category: "$_id",
          soldPercentage: {
            $cond: [
              { $eq: ["$total", 0] },
              0,
              { $multiply: [{ $divide: ["$sold", "$total"] }, 100] }
            ]
          }
        }
      },
      { $sort: { soldPercentage: -1 } },
      { $limit: 5 }
    ]);
    
    // Format top selling categories
    const formattedTopSellingCategories = topSellingCategories.map(cat => ({
      category: cat.category,
      soldPercentage: Math.round(cat.soldPercentage * 10) / 10
    }));
    
    res.status(200).json({
      success: true,
      products: {
        totalProducts,
        newProducts,
        soldProducts,
        activeListings,
        averageTimeToSell,
        averagePrice,
        categoryDistribution: formattedCategoryDistribution,
        priceRanges: priceRangeDistribution,
        monthlySales: formattedMonthlySales,
        topSellingCategories: formattedTopSellingCategories
      }
    });
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching product statistics' });
  }
});

// Get donation analytics
router.get('/donations/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Convert string dates to Date objects if provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Set start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Get donation counts
    const totalDonations = await Donation.countDocuments();
    const newDonations = await Donation.countDocuments({ 
      donationDate: { $gte: start, $lte: end } 
    });
    const claimedDonations = await Donation.countDocuments({ status: 'collected' });
    const pendingDonations = await Donation.countDocuments({ status: 'available' });
    
    // Get top donors
    const topDonors = await Donation.aggregate([
      {
        $group: {
          _id: "$donatedBy",
          donationCount: { $sum: 1 }
        }
      },
      { $sort: { donationCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $project: {
          _id: 0,
          userId: { $arrayElemAt: ["$userInfo.userName", 0] },
          donations: "$donationCount"
        }
      }
    ]);
    
    // Get monthly donation trend
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const monthlyDonations = await Donation.aggregate([
      {
        $match: {
          donationDate: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$donationDate" },
            month: { $month: "$donationDate" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format monthly donations data
    const formattedMonthlyDonations = monthlyDonations.map(item => ({
      month: item._id.month,
      count: item.count
    }));
    
    // For claimed donations, calculate time to claim
    // This is approximate since we don't have a specific claimedAt field
    // We'll use updatedAt as a proxy if it exists
    
    // Mock claim rates (since we don't have actual time-to-claim data in the schema)
    const claimRates = [
      { timeFrame: 'Within 1 day', percentage: 42 },
      { timeFrame: '1-3 days', percentage: 28 },
      { timeFrame: '4-7 days', percentage: 18 },
      { timeFrame: 'Over 7 days', percentage: 12 },
    ];
    
    res.status(200).json({
      success: true,
      donations: {
        totalDonations,
        newDonations,
        claimedDonations,
        pendingDonations,
        topDonors,
        monthlyDonations: formattedMonthlyDonations,
        claimRates
      }
    });
  } catch (error) {
    console.error('Error fetching donation stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching donation statistics' });
  }
});

// Get volunteer analytics
router.get('/volunteers/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Convert string dates to Date objects if provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Set start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Get volunteer counts
    const totalVolunteers = await User.countDocuments({ role: 'volunteer' });
    const pendingVolunteers = await User.countDocuments({ role: 'volunteer_pending' });
    const activeVolunteers = await User.countDocuments({
      role: 'volunteer',
      lastSeen: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    // Monthly volunteer registrations
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const volunteerActivity = await User.aggregate([
      {
        $match: {
          role: 'volunteer',
          registrationDate: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$registrationDate" },
            month: { $month: "$registrationDate" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format volunteer activity data
    const formattedVolunteerActivity = volunteerActivity.map(item => ({
      month: item._id.month,
      tasks: item.count // Using registration count as a proxy for tasks
    }));
    
    // Since there's no specific volunteer task model, we'll create mock data for top volunteers
    // In a real implementation, you'd query task history or another relevant collection
    const topVolunteers = await User.find({ role: 'volunteer' })
      .sort({ registrationDate: 1 }) // Older volunteers first as a proxy for experience
      .limit(5)
      .select('userName');
    
    const formattedTopVolunteers = topVolunteers.map((volunteer, index) => ({
      userId: volunteer.userName,
      tasksCompleted: 50 - (index * 8), // Mock data
      responseTime: 2 + (index * 0.5)   // Mock data
    }));
    
    // Mock task categories
    const taskCategories = [
      { category: 'User Support', count: 180 },
      { category: 'Content Moderation', count: 120 },
      { category: 'Donation Coordination', count: 87 }
    ];
    
    res.status(200).json({
      success: true,
      volunteers: {
        totalVolunteers,
        pendingVolunteers,
        activeVolunteers,
        tasksCompleted: 387, // Mock value
        avgResponseTime: 5.4, // Mock value in hours
        volunteerActivity: formattedVolunteerActivity,
        topVolunteers: formattedTopVolunteers,
        taskCategories
      }
    });
  } catch (error) {
    console.error('Error fetching volunteer stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching volunteer statistics' });
  }
});

// Get report analytics
router.get('/reports/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Convert string dates to Date objects if provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    
    // Set start to beginning of day and end to end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Get user report counts
    const totalUserReports = await UserReport.countDocuments();
    const newUserReports = await UserReport.countDocuments({ 
      createdAt: { $gte: start, $lte: end } 
    });
    const resolvedUserReports = await UserReport.countDocuments({ 
      status: { $in: ['resolved', 'dismissed'] } 
    });
    const pendingUserReports = await UserReport.countDocuments({ 
      status: { $in: ['pending', 'reviewed'] } 
    });
    
    // Get product report counts
    const totalProductReports = await ProductReport.countDocuments();
    const newProductReports = await ProductReport.countDocuments({ 
      createdAt: { $gte: start, $lte: end } 
    });
    const resolvedProductReports = await ProductReport.countDocuments({ 
      status: { $in: ['resolved', 'dismissed'] } 
    });
    const pendingProductReports = await ProductReport.countDocuments({ 
      status: { $in: ['pending', 'reviewed'] } 
    });
    
    // Combine counts
    const totalReports = totalUserReports + totalProductReports;
    const newReports = newUserReports + newProductReports;
    const resolvedReports = resolvedUserReports + resolvedProductReports;
    const pendingReports = pendingUserReports + pendingProductReports;
    
    // Get user report categories distribution
    const userReportCategories = await UserReport.aggregate([
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get product report categories distribution
    const productReportCategories = await ProductReport.aggregate([
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Format report categories
    const formattedUserReportCategories = userReportCategories.map(cat => ({
      category: cat._id,
      count: cat.count,
      type: 'user'
    }));
    
    const formattedProductReportCategories = productReportCategories.map(cat => ({
      category: cat._id,
      count: cat.count,
      type: 'product'
    }));
    
    const formattedReportCategories = [...formattedUserReportCategories, ...formattedProductReportCategories]
      .sort((a, b) => b.count - a.count);
    
    // Get monthly report trend for both types
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const userMonthlyReports = await UserReport.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    const productMonthlyReports = await ProductReport.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format and combine monthly reports data
    const formattedUserMonthlyReports = userMonthlyReports.map(item => ({
      month: item._id.month,
      year: item._id.year,
      count: item.count
    }));
    
    const formattedProductMonthlyReports = productMonthlyReports.map(item => ({
      month: item._id.month,
      year: item._id.year,
      count: item.count
    }));
    
    // Merge the reports by month
    const allMonths = new Set([
      ...formattedUserMonthlyReports.map(r => `${r.year}-${r.month}`),
      ...formattedProductMonthlyReports.map(r => `${r.year}-${r.month}`)
    ]);
    
    const formattedMonthlyReports = Array.from(allMonths).map(yearMonth => {
      const [year, month] = yearMonth.split('-').map(Number);
      const userReport = formattedUserMonthlyReports.find(r => r.year === year && r.month === month);
      const productReport = formattedProductMonthlyReports.find(r => r.year === year && r.month === month);
      
      return {
        month,
        year,
        count: (userReport?.count || 0) + (productReport?.count || 0)
      };
    }).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    
    // Get most reported users
    const reportedUsers = await UserReport.aggregate([
      {
        $group: {
          _id: "$reportedUser",
          reportCount: { $sum: 1 }
        }
      },
      { $sort: { reportCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $project: {
          _id: 0,
          userId: { $arrayElemAt: ["$userInfo.userName", 0] },
          reportCount: 1
        }
      }
    ]);
    
    // Calculate avg resolution time for user reports
    const userResolutionTimeData = await UserReport.aggregate([
      {
        $match: {
          status: 'resolved',
          reviewedAt: { $exists: true }
        }
      },
      {
        $project: {
          resolutionTime: {
            $divide: [
              { $subtract: ["$reviewedAt", "$createdAt"] },
              1000 * 60 * 60 // Convert ms to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResolutionTime: { $avg: "$resolutionTime" }
        }
      }
    ]);
    
    // Calculate avg resolution time for product reports
    const productResolutionTimeData = await ProductReport.aggregate([
      {
        $match: {
          status: 'resolved',
          reviewedAt: { $exists: true }
        }
      },
      {
        $project: {
          resolutionTime: {
            $divide: [
              { $subtract: ["$reviewedAt", "$createdAt"] },
              1000 * 60 * 60 // Convert ms to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResolutionTime: { $avg: "$resolutionTime" }
        }
      }
    ]);
    
    // Calculate combined average resolution time
    let avgResolutionTime = 0;
    let totalResolvedWithTime = 0;
    
    if (userResolutionTimeData.length > 0) {
      avgResolutionTime += userResolutionTimeData[0].avgResolutionTime;
      totalResolvedWithTime++;
    }
    
    if (productResolutionTimeData.length > 0) {
      avgResolutionTime += productResolutionTimeData[0].avgResolutionTime;
      totalResolvedWithTime++;
    }
    
    avgResolutionTime = totalResolvedWithTime > 0 
      ? Math.round((avgResolutionTime / totalResolvedWithTime) * 10) / 10 
      : 19.3; // Default fallback value
    
    // Mock resolution outcomes (since we don't have resolution types stored)
    const resolutionOutcomes = [
      { outcome: 'Warning Issued', percentage: 45 },
      { outcome: 'Content Removed', percentage: 30 },
      { outcome: 'No Action Needed', percentage: 20 },
      { outcome: 'Account Suspended', percentage: 5 },
    ];
    
    res.status(200).json({
      success: true,
      reports: {
        totalReports,
        newReports,
        resolvedReports,
        pendingReports,
        avgResolutionTime,
        reportCategories: formattedReportCategories,
        monthlyReports: formattedMonthlyReports,
        reportedUsers,
        resolutionOutcomes
      }
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching report statistics' });
  }
});

/*** USER MANAGEMENT ROUTES ***/

// Get all users (admin only) no filter
router.get('/users/', async (req, res) => {
  try {
    const users = await User.find()
      .select('profilePicture userName email role isBlocked');

    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users: ', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
});

// Get single user details
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Find user
    const user = await User.findById(userId)
      .select('-password -authCookie -authCookieCreated -authCookieExpires');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Get user's products
    const products = await Product.find({ seller: userId })
      .populate('buyer', 'userName')
      .select('-images -offerRequests')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    // Get user's purchased products
    const purchasedProducts = await Product.find({ buyer: userId })
      .populate('seller', 'userName')
      .select('-images -offerRequests')
      .populate('seller', 'userName')
      .sort({ transactionDate: -1 })
      .limit(10)
      .lean();
    
    // Get user's donations
    const donations = await Donation.find({ donatedBy: userId })
      .populate('collectedBy', 'userName')
      .select('-images')
      .sort({ donationDate: -1 })
      .limit(10)
      .lean();

    // Get user's lost item postings
    const lostitems = await LostItem.find({ user: userId })
      .select('-images')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    // Get reports filed by this user (both types)
    const userReportsFiled = await UserReport.find({ reporter: userId })
      .select('reason reportedUser createdAt status')
      .populate('reportedUser', 'userName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
      
    const productReportsFiled = await ProductReport.find({ reporter: userId })
      .select('reason product createdAt status')
      .populate('product', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    // Get reports against this user
    const reportsAgainst = await UserReport.find({ reportedUser: userId })
      .select('reason reporter createdAt status')
      .populate('reporter', 'userName')
      .populate('reportedUser', 'userName')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        password: undefined
      },
      activity: {
        products,
        purchasedProducts,
        donations,
	lostitems,
        reportsFiled: {
          user: userReportsFiled,
          product: productReportsFiled
        },
        reportsAgainst
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user details' });
  }
});

// Update user status or role
router.patch('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, status, action } = req.body;
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Handle special actions
    if (action) {
      switch (action) {
        case 'approveVolunteer':
          if (user.role !== 'volunteer_pending') {
            return res.status(400).json({ success: false, message: 'User is not a pending volunteer' });
          }
          user.role = 'volunteer';
          break;
          
        case 'rejectVolunteer':
          if (user.role !== 'volunteer_pending') {
            return res.status(400).json({ success: false, message: 'User is not a pending volunteer' });
          }
          user.role = 'user';
          break;
          
        default:
          return res.status(400).json({ success: false, message: 'Invalid action' });
      }
    } else {
      // Regular updates
      if (role && ['admin', 'volunteer', 'user'].includes(role)) {
        user.role = role;
      }
      
      // Additional fields you might want to update
      // This would depend on your User schema - you can add more fields as needed
    }
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        _id: user._id,
        userName: user.userName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Server error updating user' });
  }
});

/*** PRODUCT MANAGEMENT ROUTES ***/

// Get all products with filtering and pagination
router.get('/products', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      status, 
      minPrice, 
      maxPrice,
      sortBy,
      order = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) {
      query.category = category;
    }
    
    if (status) {
      query.status = status;
    }
    
    // Price filters
    if (minPrice || maxPrice) {
      query.price = {};
      
      if (minPrice) {
        query.price.$gte = parseInt(minPrice);
      }
      
      if (maxPrice) {
        query.price.$lte = parseInt(maxPrice);
      }
    }
    
    // Build sort object
    let sort = {};
    if (sortBy) {
      sort[sortBy] = order === 'asc' ? 1 : -1;
    } else {
      sort = { createdAt: -1 }; // Default sort by creation date
    }
    
    // Execute query with pagination
    const products = await Product.find(query)
      .populate('seller', 'userName')
      .populate('buyer', 'userName')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Get total count
    const totalProducts = await Product.countDocuments(query);
    
    res.status(200).json({
      success: true,
      products,
      totalPages: Math.ceil(totalProducts / parseInt(limit)),
      currentPage: parseInt(page),
      totalProducts
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Server error fetching products' });
  }
});

// Get single product details
router.get('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Find product
    const product = await Product.findById(productId)
      .populate('seller', 'userName email phone')
      .populate('buyer', 'userName email phone');
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Get related reports for this product
    const reports = await ProductReport.find({ product: productId })
      .populate('reporter', 'userName')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      product,
      reports
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).json({ success: false, message: 'Server error fetching product details' });
  }
});

// Delete product (hard delete)
router.delete('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Find and delete product
    const product = await Product.findByIdAndDelete(productId);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Server error deleting product' });
  }
});

/*** DONATION MANAGEMENT ROUTES ***/

// Get all donations with filtering and pagination
router.get('/donations', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      status, 
      sortBy,
      order = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    // Build sort object
    let sort = {};
    if (sortBy) {
      sort[sortBy] = order === 'asc' ? 1 : -1;
    } else {
      sort = { donationDate: -1 }; // Default sort by donation date
    }
    
    // Execute query with pagination
    const donations = await Donation.find(query)
      .populate('donatedBy', 'userName')
      .populate('collectedBy', 'userName')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Get total count
    const totalDonations = await Donation.countDocuments(query);
    
    res.status(200).json({
      success: true,
      donations,
      totalPages: Math.ceil(totalDonations / parseInt(limit)),
      currentPage: parseInt(page),
      totalDonations
    });
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ success: false, message: 'Server error fetching donations' });
  }
});

// Get single donation details
router.get('/donations/:id', async (req, res) => {
  try {
    const donationId = req.params.id;
    
    // Find donation
    const donation = await Donation.findById(donationId)
      .populate('donatedBy', 'userName email phone')
      .populate('collectedBy', 'userName email phone');
    
    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }
    
    res.status(200).json({
      success: true,
      donation
    });
  } catch (error) {
    console.error('Error fetching donation details:', error);
    res.status(500).json({ success: false, message: 'Server error fetching donation details' });
  }
});

// Get all reports (simplified version without filtering)
router.get('/reports', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get both user reports and product reports
    const userReportsPromise = UserReport.find()
      .populate('reporter', 'userName email')
      .populate('reportedUser', 'userName email')
      .sort({ createdAt: -1 });
      
    const productReportsPromise = ProductReport.find()
      .populate('reporter', 'userName email')
      .populate('product')
      .sort({ createdAt: -1 });
      
    const userReportsCountPromise = UserReport.countDocuments();
    const productReportsCountPromise = ProductReport.countDocuments();
    
    const [userReports, productReports, userReportsCount, productReportsCount] = 
      await Promise.all([userReportsPromise, productReportsPromise, userReportsCountPromise, productReportsCountPromise]);
    
    // Combine and format reports
    const combinedReports = [
      ...userReports.map(report => ({
        ...report.toObject(),
        reportType: 'user'
      })),
      ...productReports.map(report => ({
        ...report.toObject(),
        reportType: 'product'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const reports = combinedReports.slice(skip, skip + limitNum);
    const totalCount = userReportsCount + productReportsCount;
    
    return res.status(200).json({
      success: true,
      reports,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      totalReports: totalCount
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Get specific report details
router.get('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { type } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    let report;
    
    if (type === 'user') {
      report = await UserReport.findById(reportId)
        .populate('reporter', 'userName email')
        .populate('reportedUser', 'userName email');
      
      // Don't try to populate the conversationId directly
      // Fetch the conversation separately if needed
      if (report && report.includeChat && report.conversationId) {
        const conversation = await Conversation.findById(report.conversationId);
        if (conversation) {
          // Add the conversation data to the report object but don't save to DB
          report = report.toObject(); // Convert Mongoose document to plain object
          report.conversationData = conversation;
        }
      }
    } else if (type === 'product') {
      report = await ProductReport.findById(reportId)
        .populate('reporter', 'userName email')
        .populate('product');
        
      // Also populate the product seller information
      if (report && report.product) {
        await Product.populate(report.product, {
          path: 'seller',
          select: 'userName email'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Report type must be specified'
      });
    }
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: `${type.capitalize()} report not found`
      });
    }
    
    return res.status(200).json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Get report details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Block user based on report
router.post('/reports/:reportId/resolve/block-user', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { adminNotes, blockReason } = req.body;
    
    if (!adminNotes || !blockReason) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes and block reason are required'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    // Check if it's a user report or product report
    let report = await UserReport.findById(reportId);
    let reportType = 'user';
    
    if (!report) {
      report = await ProductReport.findById(reportId).populate('product');
      reportType = 'product';
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }
    }
    
    let userToBlock;
    let reporterUser;
    
    if (reportType === 'user') {
      userToBlock = await User.findById(report.reportedUser);
      reporterUser = await User.findById(report.reporter);
    } else {
      // For product report, block the seller
      if (!report.product || !report.product.seller) {
        return res.status(404).json({
          success: false,
          message: 'Product or seller not found'
        });
      }
      
      userToBlock = await User.findById(report.product.seller);
      reporterUser = await User.findById(report.reporter);
    }
    
    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        message: 'User to block not found'
      });
    }
    
    // Block user
    userToBlock.isBlocked = true;
    userToBlock.blockedAt = new Date();
    userToBlock.blockedReason = blockReason;
    await userToBlock.save();
    
    // Update report status
    report.status = 'resolved';
    report.adminNotes = adminNotes;
    report.reviewedAt = new Date();
    await report.save();
    
    // Create notification for the blocked user
    const blockedNotification = new Notification({
      userId: userToBlock._id,
      type: 'user_blocked',
      message: `Your account has been blocked. Reason: ${blockReason}`,
      reportId: reportId,
      read: false
    });
    await blockedNotification.save();
    
    // Create notification for the reporter
    if (reporterUser) {
      const reporterNotification = new Notification({
        userId: reporterUser._id,
        type: 'report_reviewed',
        message: `Your report has been resolved. The reported user has been blocked.`,
        reportId: reportId,
        read: false
      });
      await reporterNotification.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      report
    });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Delete product based on report
router.post('/reports/:reportId/resolve/delete-product', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { adminNotes, deleteReason } = req.body;
    
    if (!adminNotes || !deleteReason) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes and delete reason are required'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    const report = await ProductReport.findById(reportId).populate('product').populate('reporter');
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Product report not found'
      });
    }
    
    if (!report.product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Get product seller
    const productSeller = await User.findById(report.product.seller);
    const reporterUser = report.reporter;
    
    // Set the status of the product to deleted
    const productToDelete = Product.findById(report.product._id);
    productToDelete.status = 'deleted';
    productToDelete.save();
    
    // Update report status
    report.status = 'resolved';
    report.adminNotes = adminNotes;
    report.reviewedAt = new Date();
    await report.save();
    
    // Create notification for the product seller
    if (productSeller) {
      const sellerNotification = new Notification({
        userId: productSeller._id,
        type: 'product_deleted',
        message: `Your product "${report.product.name}" has been deleted. Reason: ${deleteReason}`,
        read: false,
        productId: report.product._id,
        reportId: reportId
      });
      await sellerNotification.save();
    }
    
    // Create notification for the reporter
    if (reporterUser) {
      const reporterNotification = new Notification({
        userId: reporterUser._id,
        type: 'report_reviewed',
        message: `Your report has been resolved. The reported product has been deleted.`,
        read: false,
        productId: report.product._id,
        reportId: reportId
      });
      await reporterNotification.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      report
    });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Issue warning based on report
router.post('/reports/:reportId/resolve/issue-warning', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { adminNotes, warningMessage } = req.body;
    
    if (!adminNotes || !warningMessage) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes and warning message are required'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    // Check if it's a user report or product report
    let report = await UserReport.findById(reportId).populate('reporter');
    let reportType = 'user';
    let userToWarn;
    
    if (!report) {
      report = await ProductReport.findById(reportId).populate('product').populate('reporter');
      reportType = 'product';
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }
    }
    
    if (reportType === 'user') {
      userToWarn = await User.findById(report.reportedUser);
    } else {
      // For product report, warn the seller
      if (!report.product || !report.product.seller) {
        return res.status(404).json({
          success: false,
          message: 'Product or seller not found'
        });
      }
      
      userToWarn = await User.findById(report.product.seller);
    }
    
    if (!userToWarn) {
      return res.status(404).json({
        success: false,
        message: 'User to warn not found'
      });
    }
    
    // Update report status
    report.status = 'resolved';
    report.adminNotes = adminNotes;
    report.reviewedAt = new Date();
    await report.save();

    userToWarn.warningIssued += 1;
    await userToWarn.save();
    
    // Create notification for the warned user
    const warnedNotification = new Notification({
      userId: userToWarn._id,
      type: 'warning_received',
      message: warningMessage,
      reportId: reportId,
      read: false
    });
    await warnedNotification.save();
    
    // Create notification for the reporter
    if (report.reporter) {
      const reporterNotification = new Notification({
        userId: report.reporter._id,
        type: 'report_reviewed',
        message: `Your report has been resolved. A warning has been issued to the ${reportType === 'user' ? 'user' : 'product seller'}.`,
        reportId: reportId,
        read: false
      });
      await reporterNotification.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'Warning issued successfully',
      report
    });
  } catch (error) {
    console.error('Issue warning error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Dismiss report without action
router.post('/reports/:reportId/dismiss', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { adminNotes } = req.body;
    
    if (!adminNotes) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes are required'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format'
      });
    }
    
    // Check if it's a user report or product report
    let report = await UserReport.findById(reportId).populate('reporter');
    let reportType = 'user';
    
    if (!report) {
      report = await ProductReport.findById(reportId).populate('reporter');
      reportType = 'product';
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }
    }
    
    // Update report status
    report.status = 'dismissed';
    report.adminNotes = adminNotes;
    report.reviewedAt = new Date();
    await report.save();
    
    // Create notification for the reporter
    if (report.reporter) {
      const reporterNotification = new Notification({
        userId: report.reporter._id,
        type: 'report_reviewed',
        message: `Your report has been reviewed but was dismissed. No action has been taken.`,
        reportId: reportId,
        read: false
      });
      await reporterNotification.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'Report dismissed successfully',
      report
    });
  } catch (error) {
    console.error('Dismiss report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Fetch messages by report ID
router.get('/reports/:reportId/messages', async (req, res) => {
  try {
    const { reportId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID format',
      });
    }

    // Find the report and check if chat is shared
    const report = await UserReport.findById(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    if (!report.includeChat || !report.conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Chat is not shared for this report',
      });
    }

    const conversation = await Conversation.findById(report.conversationId)
      .populate('participants', 'userName');
      
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    
    res.json({ success: true, conversation });

  } catch (error) {
    console.error('Error fetching messages by report ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
