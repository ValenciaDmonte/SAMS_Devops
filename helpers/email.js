const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, text }) {
  const from = process.env.EMAIL_FROM || 'SAMS <onboarding@resend.dev>';
  const replyTo = process.env.REPLY_TO || undefined;

  const response = await resend.emails.send({
    from,
    to,
    subject,
    text,
    reply_to: replyTo
  });

  console.log('📧 Email queued via Resend:', response?.data?.id || response);
}

async function sendAttendanceStatusEmail(toEmail, studentName, subjectTitle, sessionDate, status, currentPercentage, oneMissRisk = false) {
  try {
    const subject = `Attendance Update: ${subjectTitle} — ${status}`;
    let text = `Hi ${studentName},\n\n` +
               `Your attendance for "${subjectTitle}" on ${sessionDate} was recorded as: ${status}.\n\n` +
               `Current attendance in ${subjectTitle}: ${currentPercentage}%.\n`;

    if (oneMissRisk) {
      text += `\nNotice: Missing one more lecture will drop you below 75% in this subject. Please attend upcoming classes.\n`;
    }

    text += `\n— SAMS Notification`;

    await sendEmail({ to: toEmail, subject, text });
    console.log(`✅ Sent attendance-status email to ${toEmail}`);
  } catch (err) {
    console.error(`❌ Failed to send status email to ${toEmail}:`, err.message || err);
  }
}

async function sendMonthlyAlertEmail(toEmail, studentName, subjectTitle, percentage, note = '') {
  try {
    const subject = `Monthly Attendance Alert: ${subjectTitle} — ${percentage}%`;
    let text = `Hi ${studentName},\n\n` +
               `Your monthly attendance in "${subjectTitle}" is ${percentage}%.\n` +
               `Minimum required: 75%.\n\n`;

    if (note) text += note + '\n\n';

    text += `Please contact your teacher if you have any queries.\n\n— SAMS Support`;

    await sendEmail({ to: toEmail, subject, text });
    console.log(`✅ Sent monthly alert to ${toEmail}`);
  } catch (err) {
    console.error(`❌ Failed to send monthly alert:`, err.message || err);
  }
}

module.exports = { sendEmail, sendAttendanceStatusEmail, sendMonthlyAlertEmail };
