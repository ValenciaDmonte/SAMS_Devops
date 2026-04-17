const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Dashboard Stats
router.get('/stats', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const counts = await Promise.all([
      pool.query('SELECT COUNT(*) FROM students WHERE institution_id=$1', [institution_id]),
      pool.query('SELECT COUNT(*) FROM teachers WHERE institution_id=$1', [institution_id]),
      pool.query('SELECT COUNT(*) FROM classes WHERE institution_id=$1', [institution_id]),
      pool.query('SELECT COUNT(*) FROM subjects WHERE institution_id=$1', [institution_id]),
    ]);
    res.json({
      students: +counts[0].rows[0].count,
      teachers: +counts[1].rows[0].count,
      classes:  +counts[2].rows[0].count,
      subjects: +counts[3].rows[0].count,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// =====================
// CRUD - Teachers
// =====================

router.post('/teachers', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  const { password, name, department, email } = req.body;
  try {
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const exists = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    if (exists.rows.length) return res.status(400).json({ error: 'A user with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const role = await pool.query('SELECT role_id FROM roles WHERE role_name=$1', ['Teacher']);
    const roleId = role.rows[0].role_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        'INSERT INTO users (username, password, role_id, email, institution_id) VALUES ($1,$2,$3,$4,$5) RETURNING user_id',
        [email.toLowerCase(), hashed, roleId, email, institution_id]
      );
      await client.query(
        'INSERT INTO teachers (user_id, name, department, email, institution_id) VALUES ($1,$2,$3,$4,$5)',
        [user.rows[0].user_id, name, department, email, institution_id]
      );
      await client.query('COMMIT');
      res.status(201).json({ message: `Teacher registered successfully! Login Email: ${email}` });
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  } catch (err) {
    console.error('Teacher register error:', err);
    res.status(500).json({ error: 'Failed to register teacher' });
  }
});

router.get('/teachers', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query(`
      SELECT t.teacher_id, t.name, t.department, t.email, u.username
      FROM teachers t JOIN users u ON t.user_id=u.user_id
      WHERE t.institution_id=$1 ORDER BY t.name
    `, [institution_id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch teachers' }); }
});

router.get('/teachers/:teacher_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.teacher_id;
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query(`
      SELECT t.teacher_id, t.name, t.department, t.email, u.username
      FROM teachers t JOIN users u ON t.user_id=u.user_id
      WHERE t.teacher_id=$1 AND t.institution_id=$2
    `, [id, institution_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch teacher' }); }
});

router.put('/teachers/:teacher_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.teacher_id;
  const institution_id = req.user.institution_id;
  const { name, department, email } = req.body;
  try {
    const result = await pool.query(
      'UPDATE teachers SET name=$1, department=$2, email=$3 WHERE teacher_id=$4 AND institution_id=$5',
      [name, department, email, id, institution_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'Teacher updated successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to update teacher' }); }
});

router.delete('/teachers/:teacher_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.teacher_id;
  const institution_id = req.user.institution_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const teacherRes = await client.query(
      'SELECT user_id FROM teachers WHERE teacher_id=$1 AND institution_id=$2',
      [id, institution_id]
    );
    if (!teacherRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Teacher not found' });
    }
    const user_id = teacherRes.rows[0].user_id;
    await client.query(`DELETE FROM timetable WHERE ts_id IN (SELECT ts_id FROM teachersubject WHERE teacher_id=$1)`, [id]);
    await client.query('DELETE FROM teachersubject WHERE teacher_id=$1', [id]);
    await client.query('DELETE FROM teachers WHERE teacher_id=$1', [id]);
    await client.query('DELETE FROM users WHERE user_id=$1', [user_id]);
    await client.query('COMMIT');
    res.json({ message: 'Teacher deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(' Teacher delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete teacher (check dependencies)' });
  } finally { client.release(); }
});

// =====================
// CRUD - Students
// =====================

router.post('/students', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  const { name, roll_no, batch, dept, email, class_id } = req.body;
  try {
    const checkR = await pool.query('SELECT * FROM students WHERE roll_no=$1 AND institution_id=$2', [roll_no, institution_id]);
    if (checkR.rows.length) return res.status(400).json({ error: 'Roll number already exists in your institution' });

    if (!email) return res.status(400).json({ error: 'Email is required' });
    const emailCheck = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    if (emailCheck.rows.length) return res.status(400).json({ error: 'A user with this email already exists' });

    const username = email.toLowerCase();
    const password = 'student@123';
    const hashed = await bcrypt.hash(password, 10);

    const role = await pool.query('SELECT role_id FROM roles WHERE role_name=$1', ['Student']);
    if (role.rows.length === 0) return res.status(500).json({ error: "Role 'Student' not found." });
    const roleId = role.rows[0].role_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const u = await client.query(
        'INSERT INTO users (username, password, role_id, email, institution_id) VALUES ($1,$2,$3,$4,$5) RETURNING user_id',
        [username, hashed, roleId, email, institution_id]
      );
      await client.query(
        'INSERT INTO students (user_id, name, roll_no, batch, email, dept, class_id, institution_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [u.rows[0].user_id, name, roll_no, batch, email, dept, class_id, institution_id]
      );
      await client.query('COMMIT');
      res.status(201).json({ message: `Student registered successfully! Login Email: ${email}, Password: ${password}` });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message || 'Transaction failed' });
    } finally { client.release(); }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to register student' });
  }
});

router.get('/students', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query(`
      SELECT s.student_id, s.name, s.roll_no, s.batch, s.dept, s.email, u.username,
             c.name AS class_name, s.class_id
      FROM students s
      JOIN users u ON s.user_id=u.user_id
      LEFT JOIN classes c ON s.class_id=c.class_id
      WHERE s.institution_id=$1
      ORDER BY s.roll_no
    `, [institution_id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch students' }); }
});

router.get('/students/:student_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.student_id;
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query(`
      SELECT s.student_id, s.name, s.roll_no, s.batch, s.dept, s.email, u.username
      FROM students s JOIN users u ON s.user_id=u.user_id
      WHERE s.student_id=$1 AND s.institution_id=$2
    `, [id, institution_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch student' }); }
});

router.put('/students/:student_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.student_id;
  const institution_id = req.user.institution_id;
  const { name, roll_no, batch, dept, email, class_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE students SET name=$1, roll_no=$2, batch=$3, dept=$4, email=$5, class_id=$6 WHERE student_id=$7 AND institution_id=$8 RETURNING *',
      [name, roll_no, batch, dept, email, class_id, id, institution_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student updated successfully', student: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update student' });
  }
});

router.delete('/students/:student_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.student_id;
  const institution_id = req.user.institution_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const studentRes = await client.query(
      'SELECT user_id FROM students WHERE student_id=$1 AND institution_id=$2',
      [id, institution_id]
    );
    if (!studentRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found' });
    }
    const user_id = studentRes.rows[0].user_id;
    await client.query('DELETE FROM students WHERE student_id=$1', [id]);
    await client.query('DELETE FROM users WHERE user_id=$1', [user_id]);
    await client.query('COMMIT');
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to delete student (check dependencies)' });
  } finally { client.release(); }
});

// =====================
// CRUD - Classes
// =====================

router.post('/classes', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  const { name, term, section } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO classes (name,term,section,institution_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, term, section, institution_id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create class' }); }
});

router.get('/classes', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query('SELECT * FROM classes WHERE institution_id=$1 ORDER BY name', [institution_id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch classes' }); }
});

router.get('/classes/:class_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.class_id;
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query('SELECT * FROM classes WHERE class_id=$1 AND institution_id=$2', [id, institution_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Class not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch class' }); }
});

router.put('/classes/:class_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.class_id;
  const institution_id = req.user.institution_id;
  const { name, term, section } = req.body;
  try {
    const result = await pool.query(
      'UPDATE classes SET name=$1, term=$2, section=$3 WHERE class_id=$4 AND institution_id=$5',
      [name, term, section, id, institution_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Class not found' });
    res.json({ message: 'Class updated successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to update class' }); }
});

router.delete('/classes/:class_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.class_id;
  const institution_id = req.user.institution_id;
  try {
    const result = await pool.query('DELETE FROM classes WHERE class_id=$1 AND institution_id=$2', [id, institution_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Class not found' });
    res.json({ message: 'Class deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete class' }); }
});

// =====================
// CRUD - Subjects
// =====================

router.post('/subjects', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  const { code, title } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO subjects (code,title,institution_id) VALUES ($1,$2,$3) RETURNING *',
      [code, title, institution_id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create subject' }); }
});

router.get('/subjects', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query('SELECT * FROM subjects WHERE institution_id=$1 ORDER BY code', [institution_id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch subjects' }); }
});

router.get('/subjects/:subject_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.subject_id;
  const institution_id = req.user.institution_id;
  try {
    const r = await pool.query('SELECT * FROM subjects WHERE subject_id=$1 AND institution_id=$2', [id, institution_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Subject not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch subject' }); }
});

router.put('/subjects/:subject_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.subject_id;
  const institution_id = req.user.institution_id;
  const { code, title } = req.body;
  try {
    const result = await pool.query(
      'UPDATE subjects SET code=$1, title=$2 WHERE subject_id=$3 AND institution_id=$4',
      [code, title, id, institution_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject updated successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to update subject' }); }
});

router.delete('/subjects/:subject_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.subject_id;
  const institution_id = req.user.institution_id;
  try {
    const result = await pool.query('DELETE FROM subjects WHERE subject_id=$1 AND institution_id=$2', [id, institution_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete subject' }); }
});

// =====================
// Class-Subject Mappings
// =====================

router.post('/classsubject', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const { class_id, subject_id } = req.body;
  try {
    const exists = await pool.query('SELECT * FROM classsubject WHERE class_id=$1 AND subject_id=$2', [class_id, subject_id]);
    if (exists.rows.length) return res.status(400).json({ error: 'Class–Subject already exists' });
    const result = await pool.query('INSERT INTO classsubject (class_id, subject_id) VALUES ($1,$2) RETURNING *', [class_id, subject_id]);
    res.status(201).json({ message: 'Class–Subject added successfully', record: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create Class–Subject' });
  }
});

router.get('/classsubject', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const result = await pool.query(`
      SELECT cs.cs_id, c.name AS class_name, c.term, c.section, s.title AS subject_title
      FROM classsubject cs
      JOIN classes c ON cs.class_id=c.class_id
      JOIN subjects s ON cs.subject_id=s.subject_id
      WHERE c.institution_id=$1
      ORDER BY cs.cs_id
    `, [institution_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch class-subjects' });
  }
});

router.put('/classsubject/:cs_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.cs_id;
  const { class_id, subject_id } = req.body;
  try {
    await pool.query('UPDATE classsubject SET class_id=$1, subject_id=$2 WHERE cs_id=$3', [class_id, subject_id, id]);
    res.json({ message: 'Class–Subject updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Class–Subject' });
  }
});

router.delete('/classsubject/:cs_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.cs_id;
  try {
    await pool.query('DELETE FROM classsubject WHERE cs_id=$1', [id]);
    res.json({ message: 'Class–Subject deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete Class–Subject' });
  }
});

// =====================
// Teacher-Subject Mappings
// =====================

router.post('/teachersubject', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const { teacher_id, cs_id } = req.body;
  try {
    const exists = await pool.query('SELECT * FROM teachersubject WHERE teacher_id=$1 AND cs_id=$2', [teacher_id, cs_id]);
    if (exists.rows.length) return res.status(400).json({ error: 'Teacher already assigned' });
    const result = await pool.query('INSERT INTO teachersubject (teacher_id, cs_id) VALUES ($1,$2) RETURNING *', [teacher_id, cs_id]);
    res.status(201).json({ message: 'Teacher–Subject added successfully', record: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add Teacher–Subject' });
  }
});

router.get('/teachersubject', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const result = await pool.query(`
      SELECT ts.ts_id, t.name AS teacher_name, c.name AS class_name, s.title AS subject_title
      FROM teachersubject ts
      JOIN teachers t ON ts.teacher_id=t.teacher_id
      JOIN classsubject cs ON ts.cs_id=cs.cs_id
      JOIN classes c ON cs.class_id=c.class_id
      JOIN subjects s ON cs.subject_id=s.subject_id
      WHERE t.institution_id=$1
    `, [institution_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Teacher–Subject data' });
  }
});

router.put('/teachersubject/:ts_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.ts_id;
  const { teacher_id, cs_id } = req.body;
  try {
    await pool.query('UPDATE teachersubject SET teacher_id=$1, cs_id=$2 WHERE ts_id=$3', [teacher_id, cs_id, id]);
    res.json({ message: 'Teacher–Subject updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Teacher–Subject' });
  }
});

router.delete('/teachersubject/:ts_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.ts_id;
  try {
    await pool.query('DELETE FROM teachersubject WHERE ts_id=$1', [id]);
    res.json({ message: 'Teacher–Subject deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete Teacher–Subject' });
  }
});

// =====================
// Timetable
// =====================

router.post('/timetable', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  const { ts_id, day_of_week, start_time, end_time, mode, topic } = req.body;
  try {
    const tsRes = await pool.query(`
      SELECT ts.teacher_id, cs.class_id
      FROM teachersubject ts
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN teachers t ON ts.teacher_id = t.teacher_id
      WHERE ts.ts_id = $1 AND t.institution_id = $2
    `, [ts_id, institution_id]);

    if (tsRes.rows.length === 0) return res.status(400).json({ error: "Invalid Teacher–Subject assignment" });

    const { teacher_id, class_id } = tsRes.rows[0];

    const conflict = await pool.query(`
      SELECT tt.*
      FROM timetable tt
      JOIN teachersubject ts ON tt.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      WHERE tt.day_of_week = $1
        AND (ts.teacher_id = $2 OR cs.class_id = $3)
        AND NOT ($4 >= tt.end_time OR $5 <= tt.start_time)
    `, [day_of_week, teacher_id, class_id, start_time, end_time]);

    if (conflict.rows.length > 0) {
      return res.status(400).json({ error: "Time conflict detected! The teacher or class already has another lecture in this slot." });
    }

    const result = await pool.query(
      'INSERT INTO timetable (ts_id, day_of_week, start_time, end_time, mode, topic) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [ts_id, day_of_week, start_time, end_time, mode, topic]
    );
    res.status(201).json({ message: 'Timetable entry added successfully', record: result.rows[0] });
  } catch (err) {
    console.error('Timetable creation error:', err);
    res.status(500).json({ error: 'Failed to create timetable entry' });
  }
});

router.get('/timetable', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const institution_id = req.user.institution_id;
  try {
    const result = await pool.query(`
      SELECT tt.timetable_id, tt.day_of_week, tt.start_time, tt.end_time, tt.mode, tt.topic,
             t.name AS teacher_name, c.name AS class_name, s.title AS subject_title
      FROM timetable tt
      JOIN teachersubject ts ON tt.ts_id=ts.ts_id
      JOIN teachers t ON ts.teacher_id=t.teacher_id
      JOIN classsubject cs ON ts.cs_id=cs.cs_id
      JOIN classes c ON cs.class_id=c.class_id
      JOIN subjects s ON cs.subject_id=s.subject_id
      WHERE t.institution_id=$1
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
        tt.start_time
    `, [institution_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch timetable' });
  }
});

router.get('/timetable/:timetable_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.timetable_id;
  const institution_id = req.user.institution_id;
  try {
    const result = await pool.query(`
      SELECT tt.*, ts.ts_id, t.name AS teacher_name, c.name AS class_name, s.title AS subject_title
      FROM timetable tt
      JOIN teachersubject ts ON tt.ts_id = ts.ts_id
      JOIN teachers t ON ts.teacher_id = t.teacher_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN classes c ON cs.class_id = c.class_id
      JOIN subjects s ON cs.subject_id = s.subject_id
      WHERE tt.timetable_id = $1 AND t.institution_id = $2
    `, [id, institution_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Timetable entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch timetable entry' });
  }
});

router.put('/timetable/:timetable_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.timetable_id;
  const { day_of_week, start_time, end_time, mode, topic } = req.body;
  try {
    await pool.query(
      'UPDATE timetable SET day_of_week=$1, start_time=$2, end_time=$3, mode=$4, topic=$5 WHERE timetable_id=$6',
      [day_of_week, start_time, end_time, mode, topic, id]
    );
    res.json({ message: 'Timetable updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update timetable entry' });
  }
});

router.delete('/timetable/:timetable_id', authenticateToken, authorizeRole('Admin'), async (req, res) => {
  const id = +req.params.timetable_id;
  try {
    await pool.query('DELETE FROM timetable WHERE timetable_id=$1', [id]);
    res.json({ message: 'Timetable deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete timetable entry' });
  }
});

module.exports = router;
