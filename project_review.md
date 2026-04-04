# Auth-Express Project Review

This document provides a complete overview of the lightweight authentication system built using Node.js, Express, and Vanilla JavaScript.

## 📁 Project Structure

```text
auth-express/
├── middleware/
│   └── auth.js         # JWT Verification Middleware
├── prisma/
│   └── schema.prisma   # Database Schema (Users, Accounts, Sessions)
├── public/
│   ├── css/
│   │   └── style.css   # Main Stylesheet
│   ├── dashboard.html  # Protected User Home
│   ├── forgot-password.html
│   ├── index.html      # Login Page (Root)
│   ├── register.html
│   └── reset-password.html
├── routes/
│   └── auth.js         # API Endpoints (Login, Register, Logout, Reset)
├── .env                # Secrets & Database URL
├── package.json        # Dependencies
└── server.js           # Express App Entry Point
```

---

## 🚀 Key Components

### 1. Backend (Node.js + Express)
- **[server.js](file:///C:/Users/thack/OneDrive/Documents/auth-express/server.js)**: Initializes the server, sets up standard middleware (JSON parsing, Cookie parsing), and serves the `public` folder as static files.
- **[routes/auth.js](file:///C:/Users/thack/OneDrive/Documents/auth-express/routes/auth.js)**: Contains the core business logic.
  - **Registration**: Hashes passwords using `bcryptjs` before saving to Prisma.
  - **Login**: Compares raw input with hashed passwords and issues a **JWT Cookie**.
  - **Forgot Password**: Generates a short-lived reset JWT and emails it via `nodemailer`.
  - **Reset Password**: Validates the reset JWT and updates the database.

### 2. Security (JWT + Cookies)
- **State Management**: Instead of using heavy server-side sessions, we use **JSON Web Tokens (JWT)**.
- **Storage**: The token is stored in an `httpOnly` cookie. This is much safer than `localStorage` because JavaScript cannot access it, preventing XSS attacks.
- **Middleware ([middleware/auth.js](file:///C:/Users/thack/OneDrive/Documents/auth-express/middleware/auth.js))**: A reusable function that intercepts requests to protected routes (like `/api/auth/me`) to ensure a valid token is present.

### 3. Database (Prisma)
- We use **Prisma Client** to interact with your Neon PostgreSQL database.
- The schema is identical to your original Next.js project, ensuring compatibility with your existing data.

### 4. Frontend (Vanilla JS)
- No React, no heavy bundles.
- Uses the native Browser **Fetch API** to communicate with the Express backend.
- **[dashboard.html](file:///C:/Users/thack/OneDrive/Documents/auth-express/public/dashboard.html)** performs a proactive auth check on load to ensure the user is logged in before showing content.

---

## 🛠️ How to Maintain & Run

### Environment Variables (.env)
Ensure your [.env](file:///c:/Users/thack/OneDrive/Documents/auth/.env) contains:
- `PORT`: Usually `3001` to avoid conflicts.
- `DATABASE_URL`: Connection string for Neon/Postgre.
- `JWT_SECRET`: A long random string for signing tokens.
- `EMAIL_FROM` & `EMAIL_PASSWORD`: Gmail App Password for sending reset links.

### Commands
- **Generate Client**: `npx prisma generate` (Run after every schema change).
- **Start Server**: `node server.js` (Or `npx nodemon server.js` for auto-restarts during dev).

---

## ✅ Summary of Success
- **Speed**: Loading times are near-instant due to zero frontend framework overhead.
- **Simplicity**: No complex build steps (Vite/Next). It just runs with standard Node.js.
- **Portability**: This template can be easily moved to any hosting provider (Render, Railway, DigitalOcean).
