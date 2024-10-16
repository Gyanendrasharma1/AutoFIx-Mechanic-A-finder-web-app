// server.js
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const speakeasy = require('speakeasy');
const twilio = require('twilio'); // Import Twilio
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
    secret: process.env.SESSION_SECRET || 'yourSecretKey', // Change this to a strong secret key
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
        
        // Test the connection with a simple query
        db.query('SELECT 1 + 1 AS solution', (error, results) => {
            if (error) throw error;
            console.log('The solution is: ', results[0].solution); // Should log "The solution is: 2"
        });
    }
});



app.post('/register', (req, res) => {
    console.log('Registration data received:', req.body); // Log the received data

    const {
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
        profilePhoto
    } = req.body;

    // Check if all fields are filled
    if (!fullName || !address || !city || !state || !pinCode || !country || !email || !idProof || !idNumber || !experience || !availability || !profilePhoto) {
        return res.status(400).json({ message: 'Please fill all fields' });
    }

    const mechanicData = {
        full_name: fullName,
        address,
        city,
        state,
        pin_code: pinCode,
        country,
        email,
        id_proof: idProof,
        id_number: idNumber,
        experience,
        availability,
        profile_photo: profilePhoto
    };

    // Check if the email already exists
    const checkEmailSql = 'SELECT * FROM mechanics WHERE email = ?';
    db.query(checkEmailSql, [email], (err, results) => {
        if (err) {
            console.error('Error checking existing email:', err);
            return res.status(500).json({ message: 'Error checking email' });
        }
        
        // If email exists, return error
        if (results.length > 0) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        // If email does not exist, proceed to insert
        const query = 'INSERT INTO mechanics SET ?';
        db.query(query, mechanicData, (err, result) => {
            if (err) {
                console.error('Database insertion error:', err); // Log the error
                return res.status(500).json({ message: 'Error storing data' });
            }

            // Redirect to the mechanic page after successful registration
            res.redirect('/became_mechanic.html');
        });
    });
});



// Endpoint for registering new mechanics
app.post('/register-mechanic', (req, res) => {
    const { full_name, address, city, state, pin_code, country, email, id_proof, id_number, experience, availability, profile_photo, mobile_number } = req.body;

    // Insert new mechanic data into the database
    db.query('INSERT INTO mechanics (full_name, address, city, state, pin_code, country, email, id_proof, id_number, experience, availability, profile_photo, mobile_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
    [full_name, address, city, state, pin_code, country, email, id_proof, id_number, experience, availability, profile_photo, mobile_number],
    (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
        }
        return res.json({ success: true, message: 'Registration successful!', data: results });
    });
});


// Twilio setup
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Function to generate a 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000); // Generates a 6-digit OTP
}

// Endpoint to send OTP to mobile number
app.post('/send-otp', (req, res) => {
    const { mobileNumber } = req.body;

    // Generate OTP
    const otp = generateOTP();
    console.log(`Generated OTP: ${otp}`); // Log the OTP for debugging purposes

    // Send OTP via SMS using Twilio
    twilioClient.messages
        .create({
            body: `Your OTP is: ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: mobileNumber
        })
        .then(() => {
            console.log(`Sending OTP ${otp} to ${mobileNumber}`);

            // Store the OTP securely in the database with expiration
            const expirationTime = Date.now() + 300000; // OTP valid for 5 minutes
            db.query('INSERT INTO otp_records (mobile_number, otp, expires_at) VALUES (?, ?, ?)', [mobileNumber, otp, expirationTime], (err) => {
                if (err) {
                    console.error('Error storing OTP:', err);
                    return res.status(500).json({ success: false, message: 'Failed to store OTP.' });
                }
                return res.json({ success: true, message: 'OTP sent successfully.' });
            });
        })
        .catch(error => {
            console.error('Error sending OTP:', error);
            return res.status(500).json({ success: false, message: 'Failed to send OTP.' });
        });
});

// Endpoint to verify OTP and register mechanic
app.post('/verify-otp', (req, res) => {
    const { mobileNumber, otp } = req.body;

    // Check if the OTP is valid and not expired
    db.query('SELECT otp FROM otp_records WHERE mobile_number = ? AND expires_at > ?', [mobileNumber, Date.now()], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP expired or invalid.' });
        }

        const storedOtp = results[0].otp;

        // Verify OTP
        if (parseInt(otp) === parseInt(storedOtp)) {
            // OTP is valid
            db.query('DELETE FROM otp_records WHERE mobile_number = ?', [mobileNumber]); // Remove OTP after successful verification
            // Check if mechanic already exists
            db.query('SELECT * FROM mechanics WHERE mobile_number = ?', [mobileNumber], (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                if (results.length > 0) {
                    // Existing mechanic - Redirect to the mechanic page
                    return res.json({ success: true, message: 'Logged in successfully', data: results[0] });
                } else {
                    // New mechanic - Proceed with registration
                    return res.json({ success: true, message: 'OTP verified. Proceed to registration.' });
                }
            });
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

    // Step 1: Check if the user already exists
    const checkUserSql = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserSql, [email], (err, results) => {
        if (err) {
            console.error('Error checking for existing user:', err);
            return res.status(500).json({ message: 'Error signing up user' });
        }
        if (results.length > 0) {
            // If results are found, it means the email is already in use
            return res.status(409).json({ message: 'Email already in use' });
        }

        // Step 2: Hash the password if the email does not exist
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).json({ message: 'Error signing up user' });
            }

            // Step 3: Insert the new user into the database
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
                    req.session.user = { id: user.user_id, username: user.username, email: user.email }; // Store user info in session
                    console.log('Login successful:', user);
                    return res.json({ message: 'Login successful', user });
                }
                return res.status(401).json({ message: 'Invalid credentials' });
            });
        } else {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    });
});

// Logout logic: Clear session and redirect to homepage
app.get('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).json({ message: 'Error logging out' });
        }
        res.redirect('/'); // Redirect to homepage after logout
    });
});

// Live Chat Endpoint
app.post('/api/live-chat', (req, res) => {
    const { userId } = req.body;
    console.log(`Starting live chat for user: ${userId}`);
    res.json({ message: "Live chat started!" });
});

// Phone Support Endpoint
app.post('/api/call-support', (req, res) => {
    const { phoneNumber } = req.body;
    console.log(`Initiating call to support at: ${phoneNumber}`);
    res.json({ message: `Calling ${phoneNumber}...` });
});

// Email Support Endpoint
app.post('/api/email-support', async (req, res) => {
    const { userEmail, message } = req.body;

    // Create reusable transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Use your email service
        auth: {
            user: process.env.EMAIL_USER, // Your email from .env
            pass: process.env.EMAIL_PASS, // Your email password or app password
        },
    });

    const mailOptions = {
        from: userEmail,
        to: 'support@autofix.com', // Support email address
        subject: 'Support Request',
        text: message,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ message: "Failed to send email." });
    }
});

// API endpoint to handle feedback submission
app.post('/api/feedback', (req, res) => {
    const { name, email, subject, message } = req.body;

    // Insert feedback into the database
    const query = 'INSERT INTO feedback (name, email, subject, message) VALUES (?, ?, ?, ?)';
    db.query(query, [name, email, subject, message], (err, result) => {
        if (err) {
            console.error('Error inserting feedback:', err);
            return res.status(500).json({ message: 'Failed to save feedback. Please try again later.' });
        }
        res.status(200).json({ message: 'Thank you for your feedback!' });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
