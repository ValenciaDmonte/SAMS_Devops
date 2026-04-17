const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, JWT_SECRET } = require('../config/db');
const { sendEmail } = require('../helpers/email');

// Admin Registration
router.post('/admin/register', async (req, res) => {
  const { username, password, email, institution_name } = req.body;
  try {
    if (!institution_name) return res.status(400).json({ error: 'Institution name is required' });

    const userCheck = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (userCheck.rows.length > 0) return res.status(400).json({ error: 'Username already exists' });

    const instCheck = await pool.query('SELECT * FROM institutions WHERE LOWER(name)=LOWER($1)', [institution_name]);
    if (instCheck.rows.length > 0) return res.status(400).json({ error: 'An admin for this institution already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const role = await pool.query('SELECT role_id FROM roles WHERE role_name=$1', ['Admin']);
    const roleId = role.rows[0].role_id;

    const inst = await pool.query(
      'INSERT INTO institutions (name) VALUES ($1) RETURNING institution_id',
      [institution_name]
    );
    const institution_id = inst.rows[0].institution_id;

    const user = await pool.query(
      'INSERT INTO users (username, password, role_id, email, institution_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
      [username, hashed, roleId, email, institution_id]
    );
    res.status(201).json({ message: 'Admin registered successfully', user_id: user.rows[0].user_id });
  } catch (err) {
    console.error('Admin register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login (all roles)
router.post('/login', async (req, res) => {
  const { username, email, password, role } = req.body;
  const identifier = email || username;
  console.log("🟢 Login attempt:", identifier, role);

  try {
    const isAdmin = role.toLowerCase() === 'admin';
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.password, u.institution_id, r.role_name, r.role_id
       FROM users u JOIN roles r ON u.role_id=r.role_id
       WHERE LOWER(${isAdmin ? 'u.username' : 'u.email'})=LOWER($1) AND LOWER(r.role_name)=LOWER($2)`,
      [identifier, role]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, role_name: user.role_name, role_id: user.role_id, institution_id: user.institution_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ message: 'Login successful', token, user: { user_id: user.user_id, username: user.username, role: user.role_name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Temporary OTP storage (in-memory)
const otpStore = {};

// Send OTP
router.post('/forgot-password', async (req, res) => {
  const { email, role } = req.body;
  try {
    if (!email || !role) return res.status(400).json({ error: 'Email and role are required' });

    const userRes = await pool.query(`
      SELECT u.user_id, u.username, u.email, r.role_name
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      WHERE LOWER(u.email)=LOWER($1) AND LOWER(r.role_name)=LOWER($2)
    `, [email, role]);

    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'No user found with this email and role' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

    await sendEmail({
      to: email,
      subject: 'SAMS Password Reset OTP',
      text: `Hello ${role},\n\nYour OTP for password reset is: ${otp}\nIt expires in 5 minutes.\n\n- SAMS Support`
    });

    console.log(` OTP for ${email}: ${otp}`);
    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error(' Forgot Password Error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP & Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const record = otpStore[email];
    if (!record) return res.status(400).json({ error: 'No OTP request found' });
    if (Date.now() > record.expires) return res.status(400).json({ error: 'OTP expired' });
    if (record.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password=$1 WHERE LOWER(email)=LOWER($2)', [hashed, email]);

    delete otpStore[email];
    res.json({ message: 'Password reset successful!' });
  } catch (err) {
    console.error(' Reset Password Error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
