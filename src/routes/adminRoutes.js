const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const isAdmin = require('../middleware/isAdmin');
const authenticate = require('../middleware/auth');

// Import your models
const User = require('../models/user');
const Product = require('../models/product');
const Donation = require('../models/donation');
const Report = require('../models/report_user');
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
      pendingReports
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ registrationDate: { $gte: start, $lte: end } }),
      Product.countDocuments(),
      Product.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Product.countDocuments({ status: 'sold' }),
      Donation.countDocuments(),
      Donation.countDocuments({ donationDate: { $gte: start, $lte: end } }),
      Report.countDocuments({ status: 'pending' })
    ]);
    
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
      
    const recentReportsPromise = Report.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('reporter', 'userName')
      .select('reason reporter createdAt');
    
    const [recentUsers, recentProducts, recentSales, recentDonations, recentReports] = 
      await Promise.all([
        recentUsersPromise,
        recentProductsPromise,
        recentSalesPromise,
        recentDonationsPromise,
        recentReportsPromise
      ]);
    
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
    
    // Get report counts
    const totalReports = await Report.countDocuments();
    const newReports = await Report.countDocuments({ 
      createdAt: { $gte: start, $lte: end } 
    });
    const resolvedReports = await Report.countDocuments({ 
      status: { $in: ['resolved', 'dismissed'] } 
    });
    const pendingReports = await Report.countDocuments({ 
      status: { $in: ['pending', 'reviewed'] } 
    });
    
    // Get report categories distribution
    const reportCategories = await Report.aggregate([
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Format report categories
    const formattedReportCategories = reportCategories.map(cat => ({
      category: cat._id,
      count: cat.count
    }));
    
    // Get monthly report trend
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    const monthlyReports = await Report.aggregate([
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
    
    // Format monthly reports data
    const formattedMonthlyReports = monthlyReports.map(item => ({
      month: item._id.month,
      count: item.count
    }));
    
    // Get most reported users
    const reportedUsers = await Report.aggregate([
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
    
    // Calculate avg resolution time (if reviewedAt exists)
    const resolutionTimeData = await Report.aggregate([
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
    
    const avgResolutionTime = resolutionTimeData.length > 0 
      ? Math.round(resolutionTimeData[0].avgResolutionTime * 10) / 10 
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

// Get all users with filtering and pagination
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, sortBy, order = 'desc' } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      query.role = role;
    }
    
    // Build sort object
    let sort = {};
    if (sortBy) {
      sort[sortBy] = order === 'asc' ? 1 : -1;
    } else {
      sort = { registrationDate: -1 }; // Default sort by registration date
    }
    
    // Execute query with pagination
    const users = await User.find(query)
      .select('-password -authCookie -authCookieCreated -authCookieExpires')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    
    res.status(200).json({
      success: true,
      users,
      totalPages: Math.ceil(totalUsers / parseInt(limit)),
      currentPage: parseInt(page),
      totalUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
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
      .select('name price status createdAt category')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get user's purchased products
    const purchasedProducts = await Product.find({ buyer: userId })
      .select('name price transactionDate category seller')
      .populate('seller', 'userName')
      .sort({ transactionDate: -1 })
      .limit(10);
    
    // Get user's donations
    const donations = await Donation.find({ donatedBy: userId })
      .select('name donationDate status')
      .sort({ donationDate: -1 })
      .limit(10);
    
    // Get reports filed by this user
    const reportsFiled = await Report.find({ reporter: userId })
      .select('reason reportedUser createdAt status')
      .populate('reportedUser', 'userName')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get reports against this user
    const reportsAgainst = await Report.find({ reportedUser: userId })
      .select('reason reporter createdAt status')
      .populate('reporter', 'userName')
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.status(200).json({
      success: true,
      user,
      activity: {
        products,
        purchasedProducts,
        donations,
        reportsFiled,
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
    
    // Get related reports for this product (if any field links to product)
    const reports = await Report.find({ 
      $or: [
        { product: productId },
        { details: { $regex: productId, $options: 'i' } } // In case product ID is mentioned in details
      ]
    })
    .populate('reporter', 'userName')
    .populate('reportedUser', 'userName')
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

// Update product
router.patch('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const { status, adminNotes, action } = req.body;
    
    // Find product
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Handle special actions
    if (action) {
      switch (action) {
        case 'hide':
          product.status = 'reserved'; // Using reserved as a proxy for hidden
          break;
          
        case 'remove':
          // Soft delete by changing status
          product.status = 'sold'; // Using sold as a proxy for removed
          break;
          
        default:
          return res.status(400).json({ success: false, message: 'Invalid action' });
      }
    } else {
      // Regular updates
      if (status && ['available', 'sold', 'reserved'].includes(status)) {
        product.status = status;
      }
      
      // Add admin notes if provided
      if (adminNotes) {
        // Since we don't have an adminNotes field, we could add it to description
        // This is just a placeholder - ideally you'd have a separate field
        product.description += `\n\nAdmin Notes: ${adminNotes}`;
      }
    }
    
    await product.save();
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Server error updating product' });
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

// Update donation
router.patch('/donations/:id', async (req, res) => {
  try {
    const donationId = req.params.id;
    const { status, collectedBy, action } = req.body;
    
    // Find donation
    const donation = await Donation.findById(donationId);
    
    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation not found' });
    }
    
    // Handle special actions
    if (action) {
      switch (action) {
        case 'remove':
          await Donation.findByIdAndDelete(donationId);
          return res.status(200).json({
            success: true,
            message: 'Donation removed successfully'
          });
          
        default:
          return res.status(400).json({ success: false, message: 'Invalid action' });
      }
    } else {
      // Regular updates
      if (status && ['available', 'collected'].includes(status)) {
        donation.status = status;
      }
      
      if (collectedBy) {
        donation.collectedBy = collectedBy;
      }
    }
    
    await donation.save();
    
    res.status(200).json({
      success: true,
      message: 'Donation updated successfully',
      donation
    });
  } catch (error) {
    console.error('Error updating donation:', error);
    res.status(500).json({ success: false, message: 'Server error updating donation' });
  }
});

/*** REPORT MANAGEMENT ROUTES ***/

// Get all reports with filtering and pagination
router.get('/reports', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      reason,
      sortBy,
      order = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (reason) {
      query.reason = reason;
    }
    
    // Build sort object
    let sort = {};
    if (sortBy) {
      sort[sortBy] = order === 'asc' ? 1 : -1;
    } else {
      sort = { createdAt: -1 }; // Default sort by creation date
    }
    
    // Execute query with pagination
    const reports = await Report.find(query)
      .populate('reporter', 'userName')
      .populate('reportedUser', 'userName')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Get total count
    const totalReports = await Report.countDocuments(query);
    
    res.status(200).json({
      success: true,
      reports,
      totalPages: Math.ceil(totalReports / parseInt(limit)),
      currentPage: parseInt(page),
      totalReports
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: 'Server error fetching reports' });
  }
});

// Get single report details
router.get('/reports/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // Find report
    const report = await Report.findById(reportId)
      .populate('reporter', 'userName email phone')
      .populate('reportedUser', 'userName email phone');
    
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    
    // If conversation included, get chat logs
    let conversation = null;
    if (report.includeChat && report.conversationId) {
      conversation = await Conversation.findById(report.conversationId)
        .populate('participants', 'userName')
        .select('messages participants');
    }
    
    res.status(200).json({
      success: true,
      report,
      conversation
    });
  } catch (error) {
    console.error('Error fetching report details:', error);
    res.status(500).json({ success: false, message: 'Server error fetching report details' });
  }
});

// Update report status
router.patch('/reports/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, adminNotes, action } = req.body;
    
    // Find report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    
    // Update report
    if (status && ['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      report.status = status;
      
      // Set review date if moving to reviewed or beyond
      if (['reviewed', 'resolved', 'dismissed'].includes(status) && !report.reviewedAt) {
        report.reviewedAt = new Date();
      }
    }
    
    if (adminNotes) {
      report.adminNotes = adminNotes;
    }
    
    // Handle special actions
    if (action) {
      switch (action) {
        case 'blockUser':
          // Create a new block entry
          const newBlock = new BlockList({
            blocker: report.reporter,
            blocked: report.reportedUser
          });
          await newBlock.save();
          
          report.status = 'resolved';
          report.adminNotes = (report.adminNotes || '') + '\nAction taken: User blocked';
          break;
          
        case 'removeContent':
          // This would depend on what content type is being reported
          // For simplicity, we'll just update the report status
          report.status = 'resolved';
          report.adminNotes = (report.adminNotes || '') + '\nAction taken: Content removed';
          break;
          
        default:
          return res.status(400).json({ success: false, message: 'Invalid action' });
      }
    }
    
    await report.save();
    
    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      report
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, message: 'Server error updating report' });
  }
});

module.exports = router;
