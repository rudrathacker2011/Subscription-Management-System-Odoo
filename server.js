require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const prisma = require('./lib/prisma');
const { startCronJobs } = require('./services/cron');
const { verifyConnection: verifyEmail } = require('./services/email');

// --- ROUTES ---
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const planRoutes = require('./routes/plans');
const subscriptionRoutes = require('./routes/subscriptions');
const templateRoutes = require('./routes/quotation-templates');
const invoiceRoutes = require('./routes/invoices');
const paymentRoutes = require('./routes/payments');
const discountRoutes = require('./routes/discounts');
const taxRoutes = require('./routes/taxes');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const catalogRoutes = require('./routes/catalog');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3001;

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});

// --- SECURITY ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        }
    }
}));

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3001', credentials: true }));

// --- RATE LIMITING ---
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' } });

// --- PARSERS ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---
app.use('/api/auth/login', loginLimiter); // Rate limit BEFORE route mount
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/quotation-templates', templateRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/notifications', notificationRoutes);

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Revora API', version: '2.0.0', timestamp: new Date().toISOString() });
});


// --- SPA CATCH-ALL ---
app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ success: false, error: 'API route not found.' });
    }
});

// --- ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
});


// --- START ---
const connectDB = async (retries = 5, delay = 3000) => {
    while (retries > 0) {
        try {
            await prisma.$connect();
            console.log('✅ [DB] Connected to Neon PostgreSQL');
            return true;
        } catch (err) {
            console.error(`❌ [DB] Connection failed. Retries left: ${retries - 1}`, err.message);
            retries -= 1;
            if (retries === 0) {
                console.error('❌ [DB] Failed to connect after multiple attempts. Exiting.');
                process.exit(1);
            }
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

connectDB().then(async () => {
    // Verify email connection (non-blocking)
    verifyEmail().catch(() => { });

    app.listen(PORT, () => {
        console.log(`🚀 [Revora] Server running at http://localhost:${PORT}`);
        startCronJobs();
    });
});
