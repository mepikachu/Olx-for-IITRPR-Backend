const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri, {
      dbName: 'campuskart-database', // Explicitly set database name
      tls: true,
      authMechanism: 'SCRAM-SHA-256',
      authMechanismProperties: {
        ENVIRONMENT: 'gcp',
        TOKEN_RESOURCE: 'FIRESTORE'
      },
      retryWrites: false
    });
    console.log('✅ Connected to MongoDB');
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
  } catch (err) {
    console.error('❌ DB connection error:', err);
    console.error('Connection URI:', process.env.MONGO_URI?.split('?')[0]); // Log URI without credentials
    process.exit(1);
  }
};

module.exports = connectDB;
