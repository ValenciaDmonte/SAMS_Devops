const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getTeacherIdByUserId } = require('../helpers/db');
const { sendAttendanceStatusEmail } = require('../helpers/email');

// Change Password
router.put('/change-password', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const { old_password, new_password } = req.body;
  const userId = req.user.user_id;
  try {
    const userRes = await pool.query('SELECT password FROM users WHERE user_id=$1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(old_password, userRes.rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Incorrect current password' });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password=$1 WHERE user_id=$2', [hashed, userId]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Get currently valid classes (based on timetable & current time)
router.get('/valid-classes', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  try {
    const teacherId = await getTeacherIdByUserId(req.user.user_id);
    if (!teacherId) return res.status(404).json({ error: 'Teacher not found' });

    const now = new Date();
    const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' });
    const currentTime = now.toTimeString().split(' ')[0];

    const result = await pool.query(`
      SELECT ts.ts_id, c.name AS class_name, s.title AS subject_title, tt.start_time, tt.end_time, tt.mode, tt.topic
      FROM timetable tt
      JOIN teachersubject ts ON tt.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN classes c ON cs.class_id = c.class_id
      JOIN subjects s ON cs.subject_id = s.subject_id
      WHERE ts.teacher_id = $1
        AND tt.day_of_week = $2
        AND $3 BETWEEN tt.start_time AND tt.end_time
    `, [teacherId, dayOfWeek, currentTime]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No active class right now.' });
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching valid classes:', err);
    res.status(500).json({ error: 'Failed to fetch valid classes' });
  }
});

// Start session
router.post('/start-session', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const { ts_id, lat, lng, radius } = req.body;
  try {
    const now  = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];

    const teacherLat   = (lat  != null && isFinite(parseFloat(lat)))  ? parseFloat(lat)  : null;
    const teacherLng   = (lng  != null && isFinite(parseFloat(lng)))  ? parseFloat(lng)  : null;
    const radiusMeters = (radius != null) ? Math.max(0, parseInt(radius, 10) || 200) : 200;

    const existing = await pool.query(
      'SELECT session_id FROM session WHERE ts_id = $1 AND date = $2',
      [ts_id, date]
    );
    if (existing.rows.length > 0) {
      return res.json({ message: 'Session already exists', session_id: existing.rows[0].session_id });
    }

    const newSession = await pool.query(`
      INSERT INTO session (ts_id, date, time, mode, status, teacher_lat, teacher_lng, radius_meters)
      VALUES ($1, $2, $3, 'Ongoing', 'Active', $4, $5, $6)
      RETURNING session_id
    `, [ts_id, date, time, teacherLat, teacherLng, radiusMeters]);

    res.status(201).json({ message: 'Session started', session_id: newSession.rows[0].session_id });
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// Get students for a session
router.get('/session/:session_id/students', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const { session_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT st.student_id, st.name, st.roll_no,
             COALESCE(a.status, NULL) AS status, a.attendance_id
      FROM session s
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN classes c ON cs.class_id = c.class_id
      JOIN students st ON st.class_id = c.class_id
      LEFT JOIN attendance a
        ON a.student_id = st.student_id AND a.session_id = s.session_id
      WHERE s.session_id = $1
      ORDER BY st.roll_no
    `, [session_id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students for session' });
  }
});

// Mark attendance
router.post('/session/:session_id/attendance', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const { session_id } = req.params;
  const { records } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const r of records) {
      await client.query(`
        INSERT INTO attendance (session_id, student_id, status)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, student_id)
        DO UPDATE SET status = EXCLUDED.status, marked_at = CURRENT_TIMESTAMP
      `, [session_id, r.student_id, r.status]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Attendance marked successfully' });

    // Non-blocking: send emails after responding
    (async () => {
      try {
        const sessionInfoRes = await pool.query(`
          SELECT s.date, sub.title AS subject_title
          FROM session s
          JOIN teachersubject ts ON s.ts_id = ts.ts_id
          JOIN classsubject cs ON ts.cs_id = cs.cs_id
          JOIN subjects sub ON cs.subject_id = sub.subject_id
          WHERE s.session_id = $1
        `, [session_id]);

        const sessionInfo = sessionInfoRes.rows[0] || {};
        const subjectTitle = sessionInfo.subject_title || 'Unknown Subject';
        const sessionDate = sessionInfo.date
          ? new Date(sessionInfo.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
          : new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

        for (const r of records) {
          const stuRes = await pool.query('SELECT name, email FROM students WHERE student_id = $1', [r.student_id]);
          if (!stuRes.rows.length) continue;
          const { name: studentName, email: studentEmail } = stuRes.rows[0];

          const attRes = await pool.query(`
            SELECT
              SUM(CASE WHEN a.status THEN 1 ELSE 0 END) AS present_count,
              COUNT(*) AS total_count
            FROM attendance a
            JOIN session s ON a.session_id = s.session_id
            JOIN teachersubject ts ON s.ts_id = ts.ts_id
            JOIN classsubject cs ON ts.cs_id = cs.cs_id
            JOIN subjects sub ON cs.subject_id = sub.subject_id
            WHERE a.student_id = $1 AND sub.title = $2
          `, [r.student_id, subjectTitle]);

          const present = +attRes.rows[0].present_count || 0;
          const total = +attRes.rows[0].total_count || 1;
          const percentage = Math.round((present / total) * 100);
          const wouldDropIfMissOne = ((present) / (total + 1)) * 100 < 75;
          const statusText = r.status ? 'Present' : 'Absent';

          await sendAttendanceStatusEmail(studentEmail, studentName, subjectTitle, sessionDate, statusText, percentage, wouldDropIfMissOne);
        }
      } catch (err) {
        console.error('Error sending immediate attendance emails:', err);
      }
    })();

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error marking attendance:', err);
    res.status(500).json({ error: 'Failed to mark attendance' });
  } finally {
    client.release();
  }
});

// Update single attendance record
router.put('/attendance/:attendance_id', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const { attendance_id } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE attendance SET status=$1, marked_at=CURRENT_TIMESTAMP WHERE attendance_id=$2', [status, attendance_id]);
    res.json({ message: 'Attendance updated successfully' });
  } catch (err) {
    console.error('Error updating attendance:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// Get all past sessions
router.get('/sessions', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  try {
    const teacherId = await getTeacherIdByUserId(req.user.user_id);
    if (!teacherId) return res.status(404).json({ error: 'Teacher not found' });

    const result = await pool.query(`
      SELECT s.session_id, s.date, c.name AS class_name, sub.title AS subject_title
      FROM session s
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN classes c ON cs.class_id = c.class_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      WHERE ts.teacher_id = $1
      ORDER BY s.date DESC;
    `, [teacherId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch past sessions' });
  }
});

// Get attendance for a specific session
router.get('/sessions/:session_id/attendance', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const sessionId = +req.params.session_id;
  try {
    const result = await pool.query(`
      SELECT a.attendance_id, a.student_id, s.name, s.roll_no, a.status
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      WHERE a.session_id = $1
      ORDER BY s.roll_no;
    `, [sessionId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get attendance summary per session
router.get('/attendance/stats', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  try {
    const teacherId = await getTeacherIdByUserId(req.user.user_id);
    if (!teacherId) return res.status(404).json({ error: 'Teacher not found' });

    const result = await pool.query(`
      SELECT
        s.session_id,
        s.date,
        c.name AS class_name,
        sub.title AS subject_title,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM session s
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN classes c ON cs.class_id = c.class_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      JOIN attendance a ON s.session_id = a.session_id
      WHERE ts.teacher_id = $1
      GROUP BY s.session_id, s.date, c.name, sub.title
      ORDER BY s.date ASC;
    `, [teacherId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Attendance stats error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance statistics' });
  }
});

// Get assigned classes & subjects
router.get('/assigned', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  try {
    const teacherId = await getTeacherIdByUserId(req.user.user_id);
    if (!teacherId) return res.status(404).json({ error: 'Teacher not found' });

    const result = await pool.query(`
      SELECT
        ts.ts_id,
        c.class_id, c.name AS class_name,
        s.subject_id, s.title AS subject_title
      FROM teachersubject ts
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN classes c ON cs.class_id = c.class_id
      JOIN subjects s ON cs.subject_id = s.subject_id
      WHERE ts.teacher_id = $1
      ORDER BY c.name;
    `, [teacherId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Teacher assigned fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch assigned classes & subjects' });
  }
});

// Attendance stats for a selected class-subject
router.get('/attendance/stats/:ts_id', authenticateToken, authorizeRole('Teacher'), async (req, res) => {
  const ts_id = +req.params.ts_id;
  try {
    const result = await pool.query(`
      SELECT
        s.session_id,
        s.date,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM session s
      JOIN attendance a ON s.session_id = a.session_id
      WHERE s.ts_id = $1
      GROUP BY s.session_id, s.date
      ORDER BY s.date ASC;
    `, [ts_id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Filtered attendance stats error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance stats' });
  }
});

module.exports = router;
