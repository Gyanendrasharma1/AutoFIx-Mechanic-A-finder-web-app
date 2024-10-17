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
// Endpoint to check mechanic mobile number
app.post('/check-mechanic', (req, res) => {
    const { mobileNumber } = req.body;

    // Check if the mobile number exists in the database
    db.query('SELECT * FROM mobile_no_records WHERE mobile_number = ?', [mobileNumber], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error checking mobile number.' });
        }

        if (results.length > 0) {
            // Existing mechanic
            res.json({ newMechanic: false });
        } else {
            // New mechanic, insert the mobile number into the database
            db.query('INSERT INTO mobile_no_records (mobile_number) VALUES (?)', [mobileNumber], (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: 'Error saving mobile number.' });
                }

                res.json({ newMechanic: true });
            });
        }
    });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // directory to save uploaded files
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Rename file with current timestamp
    }
});

const upload = multer({ storage: storage });

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve static files from uploads directory

// Handle the mechanic registration form submission
app.post('/submit-mechanic', upload.single('profilePhoto'), (req, res) => {
    // Extracting values from the request body
    const { full_name, address, city, state, pin_code, country, email, mobileNumber, id_proof, id_number, experience, availability } = req.body;
    const profilePhoto = req.file ? req.file.filename : null; // Get the uploaded file name if any

    // SQL query to insert the mechanic data into the database
    const sql = 'INSERT INTO mechanics (full_name, address, city, state, pin_code, country, email, mobileNumber, id_proof, id_number, experience, availability, profile_photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [full_name, address, city, state, pin_code, country, email, mobileNumber, id_proof, id_number, experience, availability, profilePhoto];

    // Executing the SQL query
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error inserting data into database:', err);
            return res.status(500).send('Error saving data.');
        }
        console.log('Mechanic registered:', result);
        res.send('Mechanic registration successful!');
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
