

<p align="center">
  <img
    width="796"
    height="533"
    alt="SAMS futuristic AI illustration"
    src="https://github.com/user-attachments/assets/a4474db6-e57a-490c-bd0d-379c0ed227ae"
  />
</p>



# 🎓 Smart Attendance Management System (SAMS)

**Smart Attendance Management System (SAMS)** is a full-stack web application designed to **automate and streamline attendance management** in educational institutions.
It enables **administrators, teachers, and students** to efficiently manage classes, schedules, and attendance records—enhanced with **AI-powered chatbot assistance** and **intelligent email notifications**.


## ✨ Key Highlights

* Role-based system for **Admin, Teacher, and Student**
* Automated attendance tracking with **real-time alerts**
* AI chatbot for **personalized attendance insights**
* Smart defaulter detection and notification system

---

## 🔑 Core Features

### 🛠️ Admin Module

* Manage students, teachers, classes, and subjects
* Map teachers to subjects and classes
* Generate and view timetables
* View system-wide attendance statistics
* Secure login with role-based access control

---

### 👨‍🏫 Teacher Module

* Mark and update attendance for each lecture/session
* View subject-wise attendance reports
* Export attendance reports as **CSV**
* Receive smart alerts for pending attendance submissions

---

### 🎓 Student Module

* View personalized attendance summaries
* Track attendance percentage across subjects
* Interact with the **AI-powered SAMS chatbot** for queries like:

  * *“How many more lectures do I need to reach 75%?”*
  * *“What is my attendance in DBMS?”*
* Receive automated email alerts for attendance issues

---

## 🔔 Intelligent Notification System

* **Attendance Update Notification**
  Students receive an email whenever attendance is marked (Present/Absent).

* **Low Attendance Alert**
  Monthly email alerts if attendance in any subject drops below **75%**.

* **Defaulter Warning System**
  Alerts students if missing even **one more lecture** would push attendance below the threshold.

---

## 🤖 AI Chatbot Integration

The SAMS chatbot is powered by the **Groq API** using the
**LLaMA-3.3-70B Versatile** model.

### Capabilities:

* Provides **personalized responses** based on:

  * Student attendance data
  * Subjects and assigned teachers
* Handles natural language queries such as:

  * *“Who teaches CN?”*
  * *“How many lectures can I miss?”*
  * *“What is my current attendance status?”*

This makes attendance tracking **interactive, intuitive, and student-friendly**.

---

## 🛠️ Tech Stack

| Layer           | Technology                  |
| --------------- | --------------------------- |
| Backend         | Node.js, Express.js         |
| Frontend        | EJS Templates, Tailwind CSS |
| Database        | PostgreSQL                  |
| AI Chatbot      | Groq API (LLaMA-3.3-70B)    |
| Notifications   | Nodemailer (SMTP)           |
| Hosting         | Render                      |
| Version Control | Git & GitHub                |

---

## ⚙️ Project Setup

### 1️⃣ Clone Repository

```bash
git clone https://github.com/<your-username>/SAMS.git
cd SAMS
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Configure Environment Variables

Create a `.env` file in the project root:

```env
PORT=10000
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>
JWT_SECRET=<your_secret_key>
EMAIL_USER=<your_email>
EMAIL_PASS=<your_email_password>
GROQ_API_KEY=<your_groq_api_key>
```

### 4️⃣ Run Locally

```bash
node index.js
```

Visit: **[http://localhost:10000](http://localhost:10000)**



sonarqube token: sqp_c4326f1f8bfc9573516d4f9ff6096ee4280141a7