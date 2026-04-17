const { pool } = require('../config/db');

async function getTeacherIdByUserId(user_id) {
  const result = await pool.query('SELECT teacher_id FROM teachers WHERE user_id = $1', [user_id]);
  return result.rows[0] ? result.rows[0].teacher_id : null;
}

async function getStudentIdByUserId(user_id) {
  const result = await pool.query('SELECT student_id FROM students WHERE user_id = $1', [user_id]);
  return result.rows[0] ? result.rows[0].student_id : null;
}

module.exports = { getTeacherIdByUserId, getStudentIdByUserId };
