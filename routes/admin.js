const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// --- ODOO ADMIN HUB: USER MANAGEMENT ---

/**
 * @rule Only Admin can create Internal Users.
 */
router.post('/create-user', requireRole('ADMIN'), async (req, res) => {
    const { name, email, password, role } = req.body;

    try {
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Core Odoo profile fields are required.' });
        }

        const validRoles = ['ADMIN', 'INTERNAL', 'PORTAL'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User profile already exists in Odoo Hub.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role
            }
        });

        res.status(201).json({
            message: `Odoo Admin successfully created a new ${role} user profile.`,
            user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
        });

    } catch (err) {
        console.error('[ODOO ADMIN ACTION ERROR]', err);
        res.status(500).json({ error: 'Odoo Hub operational failure.' });
    }
});

/**
 * List all Hub users (ADMIN only)
 */
router.get('/users', requireRole('ADMIN'), async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, createdAt: true }
        });
        res.status(200).json({ users });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching Odoo Hub user list.' });
    }
});

module.exports = router;
