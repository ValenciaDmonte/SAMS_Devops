

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
| Version Control | Git & GitHub                |
| Containerization| Docker, Docker Compose      |
| Orchestration   | Kubernetes (Minikube)       |
| CI/CD           | Jenkins                     |
| Code Quality    | SonarQube                   |
| Reverse Proxy   | Nginx                       |
| Monitoring      | Prometheus, prom-client     |

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



---

## 🚀 DevOps CI/CD Pipeline

This project includes a complete DevOps pipeline using Docker, Kubernetes, Jenkins, and SonarQube.

### Pipeline Flow

```
GitHub Push → Jenkins → SonarQube Analysis → Docker Build → Docker Hub → Kubernetes Deployment
```

### Architecture

| Component     | Role                                      | URL                          |
| ------------- | ----------------------------------------- | ---------------------------- |
| Jenkins       | CI/CD pipeline automation                 | http://localhost:8081        |
| SonarQube     | Static code analysis & quality gate       | http://localhost:9000        |
| Docker Hub    | Container image registry                  | hub.docker.com/r/valdoc2005/sams |
| Kubernetes    | Container orchestration (2 replicas)      | Minikube (local cluster)     |
| Nginx         | Reverse proxy (3-container Docker setup)  | http://localhost:8080        |
| Prometheus    | Metrics collection via `/metrics` endpoint| -                            |

### Jenkins Pipeline Stages

1. **Checkout** — pulls latest code from GitHub
2. **Install Dependencies** — runs `npm ci`
3. **SonarQube Analysis** — scans code for bugs, vulnerabilities, code smells
4. **Quality Gate** — fails the build if quality standards are not met
5. **Docker Build** — builds image `valdoc2005/sams:<build-number>`
6. **Docker Push** — pushes image to Docker Hub
7. **Deploy to Kubernetes** — rolls out updated image to the sams namespace

### How to Verify the Pipeline

**1. Jenkins — View pipeline status**
```
http://localhost:8081/job/sams-pipeline/
```
Open the latest build to see all stages and logs.

**2. SonarQube — View code quality results**
```
http://localhost:9000
```
Open the SAMS project to see Quality Gate status, bugs, vulnerabilities, and code smells.

**3. Docker Hub — View pushed images**
```
https://hub.docker.com/r/valdoc2005/sams/tags
```
Each successful build pushes a new versioned tag (`:15`, `:16`, etc.) plus `:latest`.

**4. Kubernetes — Check running pods**
```bash
kubectl get pods -n sams
kubectl get deployments -n sams
```
Should show 2 running replicas of `sams-app`.

**5. Running Application**
```
http://localhost:8080
```
The SAMS app served through Nginx reverse proxy.

**6. Prometheus Metrics**
```
http://localhost:8080/metrics
```
Exposes Node.js runtime metrics collected by prom-client.

### Docker Compose (Local 3-Container Setup)

```bash
docker compose up
```

Starts three containers:
- **nginx** — reverse proxy on port 8080
- **app** — Node.js application on port 10000
- **db** — PostgreSQL database on port 5432

### Kubernetes Manifests

All manifests are in the `k8s/` directory:

| File                      | Description                        |
| ------------------------- | ---------------------------------- |
| `namespace.yaml`          | Creates the `sams` namespace       |
| `secret.yaml`             | Stores environment secrets         |
| `deployment.yaml`         | 2-replica app deployment           |
| `service.yaml`            | Exposes the app via LoadBalancer   |
| `postgres-statefulset.yaml` | PostgreSQL with persistent storage |