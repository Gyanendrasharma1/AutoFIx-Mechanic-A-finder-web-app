// server.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

// Middleware for session management
app.use(session({
    secret: process.env.SESSION_SECRET || 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 60 } // Session will last for 1 hour
}));

// Serve static files from the Frontend-AutoFix directory
app.use(express.static(path.join(__dirname, '../Frontend-AutoFix')));

// MySQL database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'happy@1807@@@@', // Your actual password
    database: process.env.DB_NAME || 'autofix_db'
});

// Connect to the database
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
    } else {
        console.log('Connected to MySQL');
    }
});

// Set up storage for Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Create the upload instance
const upload = multer({ storage: storage });

// Route to handle mechanic registration form submission
app.post('/submit-mechanic', upload.single('profilePhoto'), (req, res) => {
    const { fullName, address, city, state, pinCode, country, email, idProof, idNumber, experience, availability, mobileNumber } = req.body;
    const profilePhoto = req.file;

    // Check if the file is uploaded
    if (!profilePhoto) {
        return res.status(400).json({ message: 'Profile photo is required.' });
    }

    // Log the received data (for debugging)
    console.log('Registration Data:', {
        fullName,
        address,
        city,
        state,
        pinCode,
        country,
        email,
        idProof,
        idNumber,
        experience,
        availability,
        profilePhoto: profilePhoto.filename
    });

    // Here you would typically save the data to a database
    const registrationQuery = `
        INSERT INTO mechanics (full_name, address, city, state, pin_code, country, email, id_proof, id_number, experience, availability, profile_photo, mobile_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(registrationQuery, [fullName, address, city, state, pinCode, country, email, idProof, idNumber, experience, availability, profilePhoto.filename, mobileNumber], (err, result) => {
        if (err) {
            console.error('Error inserting mechanic data:', err);
            return res.status(500).json({ message: 'Failed to register mechanic.' });
        }
        res.status(200).json({ message: 'Registration successful!', data: req.body });
    });
});

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Function to generate a 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000); // Generates a 6-digit OTP
}

// Endpoint to send OTP to mobile number
app.post('/send-otp', (req, res) => {
    const { mobileNumber } = req.body;

    const otp = generateOTP();
    console.log(`Generated OTP: ${otp}`);

    const expirationTime = Date.now() + 300000; // OTP valid for 5 minutes
    db.query('INSERT INTO otp_records (mobile_number, otp, expires_at) VALUES (?, ?, ?)', [mobileNumber, otp, expirationTime], (err) => {
        if (err) {
            console.error('Error storing OTP:', err);
            return res.status(500).json({ success: false, message: 'Failed to store OTP.' });
        }
        return res.json({ success: true, message: 'OTP sent successfully.' });
    });
});

// Endpoint to verify OTP and register mechanic
app.post('/verify-otp', (req, res) => {
    const { mobileNumber, otp } = req.body;

    db.query('SELECT otp FROM otp_records WHERE mobile_number = ? AND expires_at > ?', [mobileNumber, Date.now()], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP expired or invalid.' });
        }

        const storedOtp = results[0].otp;

        if (parseInt(otp) === parseInt(storedOtp)) {
            db.query('DELETE FROM otp_records WHERE mobile_number = ?', [mobileNumber]);

            // Here you could call the mechanic registration function after OTP verification
            return res.json({ success: true, message: 'OTP verified. Proceed to registration.' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
    });
});

// Serve the landing page (only if user is logged in)
app.get('/landing-page', (req, res) => {
    if (req.session.loggedIn) {
        res.sendFile(path.join(__dirname, '../Frontend-AutoFix/landing-page.html'));
    } else {
        res.redirect('/'); // Redirect to home page if not logged in
    }
});

// Serve the index page (root request)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend-AutoFix/index.html'));
});

// Sign-up logic: Insert user into the database
app.post('/api/signup', (req, res) => {
    const { username, email, password } = req.body;

    const checkUserSql = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserSql, [email], (err, results) => {
        if (err) {
            console.error('Error checking for existing user:', err);
            return res.status(500).json({ message: 'Error signing up user' });
        }
        if (results.length > 0) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).json({ message: 'Error signing up user' });
            }

            const sql = `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`;
            db.query(sql, [username, email, hash], (err, result) => {
                if (err) {
                    console.error('Error inserting user:', err);
                    return res.status(500).json({ message: 'Error signing up user' });
                }
                console.log('User signed up successfully:', result);
                res.json({ message: 'User signed up successfully' });
            });
        });
    });
});

// Login logic: Validate user credentials and set session
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error('Error during login:', err);
            return res.status(500).json({ message: 'Error logging in' });
        }
        if (results.length > 0) {
            const user = results[0];
            bcrypt.compare(password, user.password_hash, (err, isMatch) => {
                if (err) {
                    console.error('Error comparing passwords:', err);
                    return res.status(500).json({ message: 'Error logging in' });
                }
                if (isMatch) {
                    req.session.loggedIn = true; // Set session loggedIn to true
                    req.session.user = { id: user.user_id, username: user.username, email: user.email }; // Store user data in session
                    return res.json({ message: 'Login successful', user: req.session.user });
                } else {
                    return res.status(401).json({ message: 'Invalid credentials' });
                }
            });
        } else {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    });
});

// Logout logic: Destroy the session
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).json({ message: 'Error logging out' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
