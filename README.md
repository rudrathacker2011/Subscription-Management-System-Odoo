# Revora Subscription Management System

Revora is a comprehensive Subscription, Product, and Invoice Management platform designed for modern SaaS and administrative workflows. It features a robust multi-stage approval engine, real-time notifications, automated cron-job renewals, and an elegant branded UI design.

## Features

- **Multi-Role Authentication**: Admin, Internal Staff, and Portal Users.
- **Workflow Engine**: 3-stage user subscription request path (Portal Request -> Admin Review -> Staff Approval).
- **Product & Catalog Management**: Differentiate between goods and services.
- **Recurring Plans**: Create daily, weekly, monthly, or yearly plans.
- **Automated Billing Engine**: Cron jobs process renewals automatically.
- **Invoices & Payments**: Generates automated bills and tracks partial/full payments.

## Architecture Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (via Neon)
- **ORM**: Prisma
- **Frontend**: Vanilla HTML/CSS/JS (Lightweight & Glassmorphic)

## Quick Start

### 1. Prerequisites
- Node.js (v18+)
- Local or Cloud PostgreSQL Database
- Supported SMTP Email Account (e.g., Gmail with App Password)

### 2. Environment Setup

Copy `.env.example` to `.env` (or setup manually):

```env
DATABASE_URL="postgres://user:password@host/db"
JWT_SECRET="super_secret_key"
PORT=3000

EMAIL_FROM="email@gmail.com"
EMAIL_PASSWORD="your-app-password"
```

### 3. Install & Initialize

```bash
# Install dependencies
npm install

# Push Prisma Database Schema
npm run db:push

# Generate Prisma Client
npm run db:generate

# Seed the database with initial Demo User / Plans
npm run seed
```

### 4. Start Server

```bash
# Development mode
npm run dev

# Production
npm start
```

## Dashboard Access

Navigate to `http://localhost:3000` to access the application. Use the seeded credentials printed to the terminal to login.
