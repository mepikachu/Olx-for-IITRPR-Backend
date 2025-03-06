const GENERAL_OTP = "123456"

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose")
const ejs = require("ejs");
const nodemailer = require("nodemailer")
const session = require("express-session")
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt"); // Add bcrypt for password hashing
require("dotenv").config();

const app = express();

app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

mongoose.connect("mongodb://localhost:27017/olxDB")

// Admin
const adminSchema = {
    admin_name: String,
    admin_mail: String,
    password: String, // Add password field
}

const Admin = mongoose.model("Admin", adminSchema)

// User
const userSchema = {
    user_name: String,
    user_mail: String,
    password: String, // Add password field
}

const User = mongoose.model("User", userSchema)

// Products
const productSchema = {
    name: String,
    description: String,
    image: String, // URL or path to the image
    price: Number,
    user_name: String
};

const Product = mongoose.model("Product", productSchema)

// Set up session for storing OTP and email
app.use(
    session({
        secret: "secret_key", // Use a strong secret
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Set `secure: true` if using HTTPS
    })
);

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Functions for authorisation
function isAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        next(); // User is authenticated, proceed to the next middleware/route
    } else {
        res.redirect("/login"); // Redirect unauthenticated users to the login page
    }
}

function isAuthorized(role) {
    return (req, res, next) => {
        if (req.session.isAuthenticated && req.session.userRole === role) {
            next(); // User is authorized, proceed
        } else {
            res.status(403).send("Access denied."); // Unauthorized access
        }
    };
}

// Register get 
app.get("/register", (req, res) => {
    res.render("register");
});

// Register post
app.post("/register", async (req, res) => {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

    // Store user details in session
    req.session.registrationDetails = {
        name,
        email,
        password: hashedPassword,
        role
    };

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Store OTP and email in session
    req.session.otp = otp;
    req.session.email = email;

    // Send OTP email
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP for Registration",
        text: `Your OTP is: ${otp}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.send("Error sending OTP. Try again.");
        } else {
            res.redirect('/verify-otp'); // Redirect to verify OTP page
        }
    });
});

// Render verify-otp page
app.get("/verify-otp", (req, res) => {
    res.render("verify-otp");
});

// Render login page
app.get("/login", (req, res) => {
    res.render("login"); // Create a login.ejs with email and password input fields
});

// Handle login with email and password
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ user_mail: email });
        const admin = await Admin.findOne({ admin_mail: email });

        if (user && await bcrypt.compare(password, user.password)) {
            req.session.isAuthenticated = true;
            req.session.userEmail = email;
            req.session.userRole = "user";
            return res.redirect(`/user/${user.user_name}`);
        } else if (admin && await bcrypt.compare(password, admin.password)) {
            req.session.isAuthenticated = true;
            req.session.userEmail = email;
            req.session.userRole = "admin";
            return res.redirect(`/admin/${admin.admin_name}`);
        } else {
            res.status(401).send("Invalid credentials");
        }
    } catch (err) {
        console.log("Server error", err);
        res.status(500).send("Server error");
    }
});

// Verify OTP
app.post("/verify-otp", async (req, res) => {
    const userOtp = req.body.otp;
    const email = req.session.email;

    if (req.session.otp && (parseInt(userOtp) === req.session.otp || userOtp === GENERAL_OTP)) {
        // OTP is valid, either from session or general OTP
        // Clear OTP from session
        req.session.otp = null;

        // Retrieve registration details from session
        const { name, password, role } = req.session.registrationDetails;

        // Create user or admin based on role
        if (role === "admin") {
            const newAdmin = new Admin({
                admin_name: name,
                admin_mail: email,
                password: password, // Store hashed password
            });
            await newAdmin.save();
            req.session.userRole = "admin";
            return res.redirect(`/admin/${newAdmin.admin_name}`);
        } else if (role === "user") {
            const newUser = new User({
                user_name: name,
                user_mail: email,
                password: password, // Store hashed password
            });
            await newUser.save();
            req.session.userRole = "user";
            return res.redirect(`/user/${newUser.user_name}`);
        } else {
            res.status(400).send("Invalid role");
        }
    } else {
        res.status(400).send("Invalid OTP. Please try again.");
    }
});

// Logout
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.log(err);
        }
        res.redirect("/login");
    });
});

// Home page
app.get("/", async (req, res) => {
    const isAuthenticated = req.session.isAuthenticated || false;
    let user_name = '';
    if (isAuthenticated && req.session.userEmail) {
        const user = await User.findOne({ user_mail: req.session.userEmail });
        if (user) {
            user_name = user.user_name;
        }
    }
    res.render("home", { isAuthenticated, user_name });
});

// Admin page

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/images");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Sell page
app.get("/user/:user/sell", isAuthenticated, isAuthorized("user"), (req, res) => {
    const user_name = req.params.user;
    res.render("sell", { user_name: user_name });
});

// Handle sell form submission
app.post("/user/:user/sell", isAuthenticated, isAuthorized("user"), upload.single("image"), async (req, res) => {
    const user_name = req.params.user;
    const { name, description, price } = req.body;
    const image = "/images/" + req.file.filename;

    const newProduct = new Product({
        name,
        description,
        image,
        price,
        user_name
    });

    try {
        await newProduct.save();
        res.redirect(`/user/${user_name}`);
    } catch (err) {
        console.log(err);
        res.status(500).send("An unexpected error occurred.");
    }
});

// User page
app.get("/user/:user_name", isAuthenticated, isAuthorized("user"), async (req, res) => {
    const user_name = req.params.user_name;
    
    // Ensure that the logged-in user matches the requested user
    if (req.session.userEmail) {
        try {
            // Find the user in the MongoDB collection
            const user = await User.findOne({ user_name: user_name, user_mail: req.session.userEmail });
            if (user) {
                // Render the user's page
                const products = await Product.find({ user_name: { $ne: user_name } });
                res.render("user", { products: products, user_name: user_name });
            } else {
                // Handle the case where the user is not found or does not match the logged-in user
                res.status(403).send("Access denied. Unauthorized access.");
            }
        } catch (err) {
            console.error("Error finding user:", err);
            res.status(500).send("Server error.");
        }
    } else {
        res.status(403).send("Access denied. Please log in.");
    }
});

// Product details page
app.get("/product/:id", isAuthenticated, async (req, res) => {
    const productId = req.params.id;
    const user_name = req.session.userEmail ? (await User.findOne({ user_mail: req.session.userEmail })).user_name : '';

    try {
        const product = await Product.findById(productId);
        res.render("product", { product, user_name });
    } catch (err) {
        console.error("Error finding product:", err);
        res.status(500).send("Server error.");
    }
});

// Port opening
app.listen(3000, function() {
    console.log("Server started on port 3000");
});
