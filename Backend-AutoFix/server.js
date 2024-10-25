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
// Endpoint to fetch mechanic data based on mobile number
app.get('/get-mechanic-data', (req, res) => {
    const mobileNumber = req.query.mobile;

    if (!mobileNumber) {
        return res.status(400).json({ success: false, message: 'Mobile number is required.' });
    }

    const sql = 'SELECT full_name, email, mobileNumber, experience, availability FROM mechanics WHERE mobileNumber = ?';
    db.query(sql, [mobileNumber], (err, results) => {
        if (err) {
            console.error('Error fetching mechanic data:', err);
            return res.status(500).json({ success: false, message: 'Error fetching mechanic data.' });
        }

        if (results.length > 0) {
            // Mechanic found, return data
            const mechanic = results[0];
            res.json({
                success: true,
                mechanic: {
                    name: mechanic.full_name,
                    email: mechanic.email,
                    mobile: mechanic.mobileNumber,
                    experience: mechanic.experience,
                    availability: mechanic.availability
                }
            });
        } else {
            // Mechanic not found
            res.status(404).json({ success: false, message: 'Mechanic not found.' });
        }
    });
});
app.post('/api/update-mechanic-status', (req, res) => {
    const { status, mobileNumber } = req.body; // Get the status and mobile number from the request body

    // Validate the status
    if (status !== 'online' && status !== 'offline') {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Update the mechanic's status in the database
    const query = 'UPDATE mechanics SET availability = ? WHERE mobileNumber = ?';
    db.query(query, [status, mobileNumber], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        return res.json({ success: true, message: 'Status updated successfully' });
    });
});
app.post('/api/bookings', (req, res) => {
    console.log('Request body:', req.body); // Log the incoming request body

    const { customer_name, contact_number, vehicle_info, service_type, location, vehicle_model } = req.body;

    // Validate request data
    if (!customer_name || !contact_number || !vehicle_info || !service_type || !location || !vehicle_model) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    // Insert the booking into the database
    const query = 'INSERT INTO bookings (customer_name, contact_number, vehicle_info, service_type, location, vehicle_model) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.query(query, [customer_name, contact_number, vehicle_info, service_type, location, vehicle_model], (err, result) => {
        if (err) {
            console.error('Error inserting booking:', err);
            return res.status(500).json({ message: 'Error adding booking.' });
        }
        res.status(201).json({ message: 'Booking added successfully.', bookingId: result.insertId });
    });
});
// GET endpoint to retrieve all bookings
app.get('/api/bookings', (req, res) => {
    const query = 'SELECT * FROM bookings';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching bookings:', err);
            return res.status(500).json({ message: 'Error fetching bookings' });
        }
        res.json(results);
    });
});
// Fetch all bookings sorted by most recent, including status
app.get('/api/bookings', (req, res) => {
    const query = `SELECT customer_name, contact_number, vehicle_info, service_type, location, vehicle_model, 
                          status, created_at, distance, issue 
                   FROM bookings 
                   ORDER BY created_at DESC`; // Sorted by most recent first

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching bookings:', err);
            return res.status(500).json({ message: 'Error fetching bookings' });
        }
        res.json(results);
    });
});

// Update the booking status (accept, reject, or cancel)
app.post('/api/bookings/:id/status', (req, res) => {
    const bookingId = req.params.id;
    const { status } = req.body;

    // Validate the status
    if (!['accepted', 'rejected', 'canceled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
    }

    const query = 'UPDATE bookings SET status = ? WHERE id = ?';
    db.query(query, [status, bookingId], (err, result) => {
        if (err) {
            console.error('Error updating booking status:', err);
            return res.status(500).json({ message: 'Error updating booking status' });
        }
        res.json({ message: 'Booking status updated successfully' });
    });
});

// Create a new booking (optional, in case new bookings need to be added)
app.post('/api/bookings', (req, res) => {
    const { customer_name, contact_number, vehicle_info, service_type, location, vehicle_model, distance, issue } = req.body;

    // Validate the input
    if (!customer_name || !contact_number || !vehicle_info || !service_type || !location || !vehicle_model) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const query = `INSERT INTO bookings (customer_name, contact_number, vehicle_info, service_type, 
                                         location, vehicle_model, distance, issue, status) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
    
    db.query(query, [customer_name, contact_number, vehicle_info, service_type, location, vehicle_model, distance, issue], (err, result) => {
        if (err) {
            console.error('Error inserting booking:', err);
            return res.status(500).json({ message: 'Error adding booking.' });
        }
        res.status(201).json({ message: 'Booking added successfully.', bookingId: result.insertId });
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
