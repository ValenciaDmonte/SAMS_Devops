const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { pool } = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getStudentIdByUserId } = require('../helpers/db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// View timetable
router.get('/timetable', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const classRes = await pool.query('SELECT class_id FROM students WHERE student_id=$1', [studentId]);
    if (!classRes.rows.length) return res.status(404).json({ error: 'Class not found' });
    const classId = classRes.rows[0].class_id;

    const result = await pool.query(`
      SELECT
        tt.day_of_week, tt.start_time, tt.end_time, tt.mode, tt.topic,
        s.title AS subject_title, t.name AS teacher_name
      FROM timetable tt
      JOIN teachersubject ts ON tt.ts_id = ts.ts_id
      JOIN teachers t ON ts.teacher_id = t.teacher_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects s ON cs.subject_id = s.subject_id
      WHERE cs.class_id = $1
      ORDER BY
        CASE
          WHEN tt.day_of_week='Monday' THEN 1
          WHEN tt.day_of_week='Tuesday' THEN 2
          WHEN tt.day_of_week='Wednesday' THEN 3
          WHEN tt.day_of_week='Thursday' THEN 4
          WHEN tt.day_of_week='Friday' THEN 5
          WHEN tt.day_of_week='Saturday' THEN 6
          WHEN tt.day_of_week='Sunday' THEN 7
        END,
        tt.start_time;
    `, [classId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Student timetable fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch timetable' });
  }
});

// Subject-wise attendance
router.get('/attendance/subjectwise', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        subj.title AS subject_title,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects subj ON cs.subject_id = subj.subject_id
      WHERE a.student_id = $1
      GROUP BY subj.title
      ORDER BY subj.title;
    `, [studentId]);

    res.json(result.rows);
  } catch (err) {
    console.error(' Student subjectwise attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch subjectwise attendance' });
  }
});

// Month-wise attendance
router.get('/attendance/monthwise', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        TO_CHAR(s.date, 'Month') AS month,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      WHERE a.student_id = $1
      GROUP BY month
      ORDER BY MIN(s.date);
    `, [studentId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Student monthwise attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch monthwise attendance' });
  }
});

// Overall attendance summary
router.get('/attendance/summary', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        SUM(CASE WHEN a.status THEN 1 ELSE 0 END) AS present_count,
        COUNT(*) AS total_classes,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM attendance a
      WHERE a.student_id = $1;
    `, [studentId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(' Student attendance summary error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
});

// Day-wise attendance
router.get('/attendance/daywise', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        TO_CHAR(s.date, 'Day') AS day_name,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      WHERE a.student_id = $1
      GROUP BY day_name
      ORDER BY MIN(s.date);
    `, [studentId]);

    res.json(result.rows);
  } catch (err) {
    console.error(' Day-wise attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch day-wise attendance' });
  }
});

// Teacher-wise attendance
router.get('/attendance/teacherwise', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        t.name AS teacher_name,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN teachers t ON ts.teacher_id = t.teacher_id
      WHERE a.student_id = $1
      GROUP BY t.name
      ORDER BY t.name;
    `, [studentId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Teacher-wise attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch teacher-wise attendance' });
  }
});

// Weekly attendance trend
router.get('/attendance/trend', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('week', s.date), 'DD Mon') AS week_start,
        ROUND(AVG(CASE WHEN a.status THEN 1 ELSE 0 END) * 100, 2) AS attendance_percentage
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      WHERE a.student_id = $1
      GROUP BY week_start
      ORDER BY MIN(s.date);
    `, [studentId]);

    res.json(result.rows);
  } catch (err) {
    console.error(' Weekly trend attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch weekly attendance trend' });
  }
});

// Defaulter risk analysis
router.get('/attendance/defaulter', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const stats = await pool.query(`
      SELECT
        SUM(CASE WHEN a.status THEN 1 ELSE 0 END) AS present_count,
        COUNT(*) AS total_classes
      FROM attendance a
      WHERE a.student_id = $1;
    `, [studentId]);

    const { present_count, total_classes } = stats.rows[0];
    const present = +present_count || 0;
    const total = +total_classes || 1;
    const attendancePercentage = Math.round((present / total) * 100);

    const target = 75;
    let future = 0;
    while (((present + future) / (total + future)) * 100 < target) future++;

    res.json({ attendance_percentage: attendancePercentage, lectures_to_attend: future, target_percentage: target });
  } catch (err) {
    console.error('Defaulter analysis error:', err);
    res.status(500).json({ error: 'Failed to calculate defaulter analysis' });
  }
});

// Subject-wise defaulter analysis
router.get('/attendance/defaulter/subjectwise', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        sub.title AS subject_name,
        SUM(CASE WHEN a.status THEN 1 ELSE 0 END) AS present_count,
        COUNT(*) AS total_classes
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      WHERE a.student_id = $1
      GROUP BY sub.title
      ORDER BY sub.title;
    `, [studentId]);

    const target = 75;
    const data = result.rows.map(row => {
      const present = +row.present_count || 0;
      const total = +row.total_classes || 1;
      const percentage = Math.round((present / total) * 100);
      let future = 0;
      while (((present + future) / (total + future)) * 100 < target) future++;
      return { subject_name: row.subject_name, attendance_percentage: percentage, lectures_to_attend: future };
    });

    res.json(data);
  } catch (err) {
    console.error(' Subject-wise defaulter error:', err);
    res.status(500).json({ error: 'Failed to fetch subject-wise defaulter analysis' });
  }
});

// Export attendance as CSV
router.get('/attendance/export', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const result = await pool.query(`
      SELECT
        subj.title AS subject,
        s.date,
        CASE WHEN a.status THEN 'Present' ELSE 'Absent' END AS attendance_status,
        t.name AS teacher_name
      FROM attendance a
      JOIN session s ON a.session_id = s.session_id
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN teachers t ON ts.teacher_id = t.teacher_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects subj ON cs.subject_id = subj.subject_id
      WHERE a.student_id = $1
      ORDER BY s.date;
    `, [studentId]);

    let csv = 'Subject,Date,Status,Teacher\n';
    result.rows.forEach(row => {
      csv += `${row.subject},${row.date},${row.attendance_status},${row.teacher_name}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('Attendance_Report.csv');
    res.send(csv);
  } catch (err) {
    console.error('CSV Export Error:', err);
    res.status(500).json({ error: 'Failed to export attendance report' });
  }
});

// AI Chatbot
router.post('/chatbot', authenticateToken, authorizeRole('Student'), async (req, res) => {
  const { question } = req.body;
  const studentId = await getStudentIdByUserId(req.user.user_id);

  try {
    const studentData = await pool.query(`
      SELECT s.student_id, s.name, c.name AS class_name
      FROM students s
      JOIN classes c ON s.class_id = c.class_id
      WHERE s.student_id = $1
    `, [studentId]);
    const student = studentData.rows[0];

    const teacherData = await pool.query(`
      SELECT sub.title AS subject_title, t.name AS teacher_name
      FROM teachersubject ts
      JOIN teachers t ON ts.teacher_id = t.teacher_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      JOIN students st ON st.class_id = cs.class_id
      WHERE st.student_id = $1
    `, [studentId]);

    const attendanceData = await pool.query(`
      SELECT sub.title AS subject_title,
             ROUND(SUM(CASE WHEN a.status THEN 1 ELSE 0 END)::decimal / COUNT(*) * 100, 2) AS attendance_percentage
      FROM attendance a
      JOIN session sess ON a.session_id = sess.session_id
      JOIN teachersubject ts ON sess.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      WHERE a.student_id = $1
      GROUP BY sub.title
    `, [studentId]);

    const teacherList = teacherData.rows.map(t => `${t.subject_title} - ${t.teacher_name}`).join(', ') || "No subjects found.";
    const attendanceList = attendanceData.rows.map(a => `${a.subject_title}: ${a.attendance_percentage}%`).join(', ') || "No attendance records available.";

    const context = `
    You are the SAMS AI Assistant for ${student.name}, a student of ${student.class_name}.
    The student's subjects and instructors are: ${teacherList}.
    Attendance record: ${attendanceList}.
    Your role: Help the student with attendance-related queries like "How many more lectures do I need to attend to reach 75% in DC?" or "Who teaches Math?"
    Always respond in a friendly, short, and precise way.
    `;

    let reply;
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: context },
          { role: "user", content: question }
        ],
        max_tokens: 200
      });
      reply = completion.choices[0].message.content;
    } catch (err) {
      console.error("Primary model failed:", err.message);
      const fallback = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: context },
          { role: "user", content: question }
        ],
        max_tokens: 200
      });
      reply = fallback.choices[0].message.content;
    }

    res.json({ reply });
  } catch (error) {
    console.error("Chatbot Error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// =====================
// Face + Geo Attendance
// =====================

router.get('/face/status', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });
    const r = await pool.query(
      'SELECT face_descriptor IS NOT NULL AS registered FROM students WHERE student_id=$1', [studentId]
    );
    res.json({ registered: r.rows[0]?.registered ?? false });
  } catch (err) { res.status(500).json({ error: 'Failed to check face status' }); }
});

router.post('/face/register', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });
    const { descriptor } = req.body;
    if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(v => typeof v === 'number' && isFinite(v)))
      return res.status(400).json({ error: 'Invalid descriptor: expected 128 finite numbers' });
    await pool.query('UPDATE students SET face_descriptor=$1 WHERE student_id=$2', [JSON.stringify(descriptor), studentId]);
    res.json({ message: 'Face registered successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to register face' }); }
});

router.get('/active-sessions', authenticateToken, authorizeRole('Student'), async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });
    const classRes = await pool.query('SELECT class_id FROM students WHERE student_id=$1', [studentId]);
    if (!classRes.rows.length) return res.status(404).json({ error: 'Student record not found' });
    const classId = classRes.rows[0].class_id;
    const result = await pool.query(`
      SELECT s.session_id, s.date, s.time, s.teacher_lat, s.teacher_lng, s.radius_meters,
             sub.title AS subject_title, t.name AS teacher_name,
             a.status AS already_marked, a.face_verified
      FROM session s
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject   cs ON ts.cs_id = cs.cs_id
      JOIN subjects       sub ON cs.subject_id = sub.subject_id
      JOIN teachers       t   ON ts.teacher_id = t.teacher_id
      LEFT JOIN attendance a ON a.session_id = s.session_id AND a.student_id = $1
      WHERE s.status = 'Active' AND cs.class_id = $2
      ORDER BY s.date DESC, s.time DESC
    `, [studentId, classId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch active sessions' }); }
});

router.post('/session/:session_id/self-mark', authenticateToken, authorizeRole('Student'), async (req, res) => {
  const { session_id } = req.params;
  try {
    const studentId = await getStudentIdByUserId(req.user.user_id);
    if (!studentId) return res.status(404).json({ error: 'Student not found' });

    const { descriptor, lat, lng } = req.body;
    if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(v => typeof v === 'number' && isFinite(v)))
      return res.status(400).json({ error: 'Invalid face descriptor' });

    // Verify session is active and get class + geo info
    const sessionRes = await pool.query(`
      SELECT s.session_id, s.status, s.teacher_lat, s.teacher_lng, s.radius_meters, cs.class_id
      FROM session s
      JOIN teachersubject ts ON s.ts_id = ts.ts_id
      JOIN classsubject   cs ON ts.cs_id = cs.cs_id
      WHERE s.session_id = $1
    `, [session_id]);
    if (!sessionRes.rows.length) return res.status(404).json({ error: 'Session not found' });
    const sess = sessionRes.rows[0];
    if (sess.status !== 'Active') return res.status(409).json({ error: 'Session is no longer active' });

    // Verify student belongs to this class
    const classRes = await pool.query('SELECT class_id FROM students WHERE student_id=$1', [studentId]);
    if (!classRes.rows.length || classRes.rows[0].class_id !== sess.class_id)
      return res.status(403).json({ error: 'You are not enrolled in this session\'s class' });

    // Check duplicate
    const dup = await pool.query('SELECT status FROM attendance WHERE session_id=$1 AND student_id=$2', [session_id, studentId]);
    if (dup.rows.length && dup.rows[0].status === true)
      return res.status(409).json({ error: 'Attendance already marked as present for this session' });

    // Geolocation check (only if teacher set coordinates)
    let studentLatToStore = null, studentLngToStore = null;
    if (sess.teacher_lat !== null && sess.teacher_lng !== null) {
      const sLat = parseFloat(lat), sLng = parseFloat(lng);
      if (!isFinite(sLat) || !isFinite(sLng))
        return res.status(400).json({ error: 'Your location is required for this session. Please enable location access.' });
      const dist = haversineDistance(sess.teacher_lat, sess.teacher_lng, sLat, sLng);
      if (sess.radius_meters > 0 && dist > sess.radius_meters)
        return res.status(403).json({ error: `You are too far from the classroom (${Math.round(dist)}m away, limit is ${sess.radius_meters}m)` });
      studentLatToStore = sLat;
      studentLngToStore = sLng;
    }

    // Face match check
    const faceRes = await pool.query('SELECT face_descriptor FROM students WHERE student_id=$1', [studentId]);
    if (!faceRes.rows.length || faceRes.rows[0].face_descriptor === null)
      return res.status(400).json({ error: 'No face registered. Please set up face recognition first.' });
    const stored = Array.isArray(faceRes.rows[0].face_descriptor)
      ? faceRes.rows[0].face_descriptor
      : JSON.parse(faceRes.rows[0].face_descriptor);
    const dist = euclideanDistance(stored, descriptor);
    if (dist > 0.6)
      return res.status(403).json({ error: 'Face not recognised. Ensure good lighting and face the camera directly.' });

    // UPSERT attendance as Present
    await pool.query(`
      INSERT INTO attendance (session_id, student_id, status, face_verified, student_lat, student_lng)
      VALUES ($1, $2, TRUE, TRUE, $3, $4)
      ON CONFLICT (session_id, student_id) DO UPDATE SET
        status=TRUE, face_verified=TRUE,
        student_lat=EXCLUDED.student_lat, student_lng=EXCLUDED.student_lng,
        marked_at=CURRENT_TIMESTAMP
    `, [session_id, studentId, studentLatToStore, studentLngToStore]);

    res.json({ message: 'Attendance marked successfully' });
  } catch (err) {
    console.error('Self-mark error:', err);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

module.exports = router;
