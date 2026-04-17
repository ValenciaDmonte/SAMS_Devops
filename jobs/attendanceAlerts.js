const cron = require('node-cron');
const { pool } = require('../config/db');
const { sendMonthlyAlertEmail } = require('../helpers/email');

// Monthly check: run at 08:00 on day 1 of every month
cron.schedule('0 8 1 * *', async () => {
  console.log(' Running monthly attendance alerts job');

  try {
    const rows = await pool.query(`
      SELECT s.student_id, s.name AS student_name, s.email AS student_email,
             sub.subject_id, sub.title AS subject_title,
             SUM(CASE WHEN a.status THEN 1 ELSE 0 END)::int AS present_count,
             COUNT(*)::int AS total_count
      FROM students s
      JOIN attendance a ON a.student_id = s.student_id
      JOIN session sess ON a.session_id = sess.session_id
      JOIN teachersubject ts ON sess.ts_id = ts.ts_id
      JOIN classsubject cs ON ts.cs_id = cs.cs_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      GROUP BY s.student_id, s.name, s.email, sub.subject_id, sub.title
      ORDER BY s.student_id;
    `);

    for (const row of rows.rows) {
      const present = +row.present_count || 0;
      const total = +row.total_count || 1;
      const percentage = Math.round((present / total) * 100);

      if (percentage < 75) {
        const note = `You are currently below the required 75% attendance for this subject. Please reach out to your teacher and attend the upcoming lectures.`;
        await sendMonthlyAlertEmail(row.student_email, row.student_name, row.subject_title, percentage, note);
      } else if (((present) / (total + 1)) * 100 < 75) {
        const note = `⚠️ Warning: If you miss one more lecture in this subject this month, your attendance will drop below 75%. Please prioritize attendance.`;
        await sendMonthlyAlertEmail(row.student_email, row.student_name, row.subject_title, percentage, note);
      }
    }

    console.log('Monthly attendance alerts job completed');
  } catch (err) {
    console.error('Monthly attendance job error:', err);
  }
});
