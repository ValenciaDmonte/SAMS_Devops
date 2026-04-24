require('dotenv').config();
const express = require('express');
const path = require('path');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Prometheus metrics
promClient.collectDefaultMetrics();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection (initialised on import)
require('./config/db');

// Public page routes
app.get('/', (req, res) => res.render('index'));
app.get('/admin', (req, res) => res.render('admin-auth'));
app.get('/teacher', (req, res) => res.render('teacher-auth'));
app.get('/student', (req, res) => res.render('student-auth'));
app.get('/admin/portal', (req, res) => res.render('admin-portal'));
app.get('/teacher/portal', (req, res) => res.render('teacher-portal'));
app.get('/student/portal', (req, res) => res.render('student-portal'));

// API routes
app.use('/api', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/student', require('./routes/student'));

// Test email route
const { sendEmail } = require('./helpers/email');
app.get('/test-email', async (req, res) => {
  try {
    await sendEmail({
      to: process.env.REPLY_TO || 'valenciaofficial2005@gmail.com',
      subject: "Render Email Test - SAMS",
      text: "Your Render app can now send emails successfully via Resend!"
    });
    console.log("✅ Test email sent successfully via Resend");
    res.send("Email sent successfully!");
  } catch (err) {
    console.error("❌ Email test failed:", err);
    res.status(500).send("Failed: " + err.message);
  }
});

// Start scheduled jobs
require('./jobs/attendanceAlerts');

// Error handlers
app.use((req, res) => res.status(404).send('Page not found'));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).send('Something went wrong!'); });

// Start server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
