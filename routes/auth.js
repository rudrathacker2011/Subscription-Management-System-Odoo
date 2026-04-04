const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASSWORD }
});

function generateTokens(user) {
    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, password, adminSecret } = req.body;
    try {
        if (!name || !email || !password)
            return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });

        const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}$/;
        if (!pwRegex.test(password))
            return res.status(400).json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, and special character.' });

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ success: false, error: 'Email already exists.' });

        const hashed = await bcrypt.hash(password, 10);
        let role = 'PORTAL';
        if (adminSecret && adminSecret === process.env.ADMIN_SECRET) role = 'ADMIN';

        const user = await prisma.user.create({ data: { name, email, password: hashed, role } });
        const { accessToken, refreshToken } = generateTokens(user);

        res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.status(201).json({ success: true, accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('[AUTH] Register error:', err);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password)
            return res.status(400).json({ success: false, error: 'Email and password are required.' });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(400).json({ success: false, error: 'Invalid credentials.' });

        if (!user.isActive)
            return res.status(403).json({ success: false, error: 'Account is deactivated.' });

        const { accessToken, refreshToken } = generateTokens(user);
        res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('[AUTH] Login error:', err);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// POST /api/auth/impersonate (Admin only)
router.post('/impersonate', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ success: false, error: 'User ID required.' });
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

        const { accessToken, refreshToken } = generateTokens(user);
        res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('[AUTH] Impersonate error:', err);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ success: false, error: 'No refresh token.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const accessToken = jwt.sign(
            { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role },
            JWT_SECRET, { expiresIn: '1h' }
        );
        res.json({ success: true, accessToken });
    } catch {
        res.status(401).json({ success: false, error: 'Invalid refresh token.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true, phone: true, companyName: true, billingAddress: true } });
    res.json({ success: true, user });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.json({ success: true, message: 'If that email exists, a reset link was sent.' });

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetTokenExpiry: expiry } });

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password.html?token=${token}`;
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'Password Reset — SubsManager',
            html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1 hour.</p>`
        });

        res.json({ success: true, message: 'Password reset email sent.' });
    } catch (err) {
        console.error('[AUTH] Forgot password error:', err);
        res.status(500).json({ success: false, error: 'Could not send reset email.' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    try {
        const user = await prisma.user.findFirst({ where: { resetToken: token, resetTokenExpiry: { gt: new Date() } } });
        if (!user) return res.status(400).json({ success: false, error: 'Invalid or expired reset token.' });

        const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}$/;
        if (!pwRegex.test(password))
            return res.status(400).json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, and special character.' });

        const hashed = await bcrypt.hash(password, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed, resetToken: null, resetTokenExpiry: null } });

        res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
        console.error('[AUTH] Reset password error:', err);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

module.exports = router;
