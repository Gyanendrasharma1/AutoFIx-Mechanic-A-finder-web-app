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
// Endpoint to check if mobile number is registered
app.post('/api/check-mobile', (req, res) => {
    const { mobile_no } = req.body;
    
    db.query('SELECT * FROM users WHERE mobile_no = ?', [mobile_no], (error, results) => {
        if (error) {
            return res.status(500).json({ error: 'Database error' });
        }

        // Check if the user exists
        if (results.length > 0) {
            return res.json({ exists: true });
        } else {
            return res.json({ exists: false });
        }
    });
});

// Endpoint to register the user
app.post('/api/register', (req, res) => {
    const { full_name, mobile_no, password } = req.body;

    // Insert new user into the database
    db.query('INSERT INTO users (full_name, mobile_no, password) VALUES (?, ?, ?)', [full_name, mobile_no, password], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: 'Database error or mobile number already exists.' });
        }

        return res.json({ success: true });
    });
});

// API endpoint to get user details
app.post('/api/get-user-details', (req, res) => {
    const { mobile_no } = req.body;

    if (!mobile_no) {
        return res.status(400).json({ success: false, message: 'Mobile number is required.' });
    }

    const query = 'SELECT full_name, mobile_no FROM users WHERE mobile_no = ?'; // Adjust according to your table name
    db.query(query, [mobile_no], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: 'Database error: ' + error });
        }

        if (results.length > 0) {
            // User found
            res.json({
                success: true,
                full_name: results[0].full_name,
                mobile_no: results[0].mobile_no
            });
        } else {
            // User not found
            res.json({ success: false, message: 'User not found.' });
        }
    });
});

// Logout (In this context, logout is managed client-side)
app.post('/api/logout', (req, res) => {
    // No action needed for logout since session is managed on the client
    res.json({ success: true, message: 'User logged out successfully.' });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
