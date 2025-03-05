const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB Atlas
const mongoURI = "mongodb+srv://admin-olx-for-iitrpr:A6cRX3doy0aFgqdV@olx-for-iitrpr.vuprw.mongodb.net/?retryWrites=true&w=majority&appName=Olx-for-IITRPR"; // Replace with your MongoDB Atlas URI
mongoose
  .connect(mongoURI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define User Schema & Model
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
});

const User = mongoose.model("login", UserSchema); // Collection name is "login"

// API Route for Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email, password });
    if (user) {
      console.log("Login successful");
      res.json({ message: "Login successful", user });
    } else {
      console.log("Invalid credentails");
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    console.log("Server error");
    res.status(500).json({ error: "Server error" });
  }
});

// API Route to Fetch All Users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Start the Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
