const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users
router.get('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { role, search, isActive, page = 1, limit = 20 } = req.query;
        const where = {};
        if (role) where.role = role;
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: { id: true, name: true, email: true, role: true, phone: true, companyName: true, isActive: true, createdAt: true },
                skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }
            }),
            prisma.user.count({ where })
        ]);

        res.json({ success: true, data: users, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) {
        console.error('[USERS] Fetch error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch users.' });
    }
});

// POST /api/users (Admin only — create Internal User)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { name, email, password, role, phone, companyName, billingAddress } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });

        const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}$/;
        if (!pwRegex.test(password))
            return res.status(400).json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, and special character.' });

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ success: false, error: 'Email already exists.' });

        const allowedRoles = ['INTERNAL', 'PORTAL'];
        const assignedRole = allowedRoles.includes(role) ? role : 'PORTAL';

        const hashed = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, email, password: hashed, role: assignedRole, phone, companyName, billingAddress, createdById: req.user.id },
            select: { id: true, name: true, email: true, role: true, phone: true, companyName: true, isActive: true, createdAt: true }
        });
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        console.error('[USERS] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create user.' });
    }
});

// GET /api/users/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        // Portal users can only view themselves
        if (req.user.role === 'PORTAL' && req.user.id !== req.params.id)
            return res.status(403).json({ success: false, error: 'Access denied.' });

        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, name: true, email: true, role: true, phone: true, companyName: true, billingAddress: true, isActive: true, createdAt: true }
        });
        if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch user.' });
    }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, async (req, res) => {
    try {
        // Portal users can only edit themselves; role change is admin-only
        if (req.user.role === 'PORTAL' && req.user.id !== req.params.id)
            return res.status(403).json({ success: false, error: 'Access denied.' });

        const { name, phone, companyName, billingAddress, isActive, role } = req.body;
        const updateData = { name, phone, companyName, billingAddress };

        // Only admin can change role or isActive
        if (req.user.role === 'ADMIN') {
            if (role) updateData.role = role;
            if (isActive !== undefined) updateData.isActive = isActive;
        }

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData,
            select: { id: true, name: true, email: true, role: true, phone: true, companyName: true, billingAddress: true, isActive: true }
        });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update user.' });
    }
});

// DELETE /api/users/:id (soft delete — Admin only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        if (req.user.id === req.params.id)
            return res.status(400).json({ success: false, error: 'Cannot deactivate your own account.' });

        await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
        res.json({ success: true, message: 'User deactivated.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to deactivate user.' });
    }
});

module.exports = router;
