const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/taxes
router.get('/', requireAuth, async (req, res) => {
    try {
        const taxes = await prisma.tax.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
        res.json({ success: true, data: taxes });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch taxes.' });
    }
});

// POST /api/taxes
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { name, taxType, percentage, description } = req.body;
        if (!name || percentage === undefined)
            return res.status(400).json({ success: false, error: 'Name and percentage are required.' });

        const tax = await prisma.tax.create({
            data: { name, taxType: taxType || 'GST', percentage: parseFloat(percentage), description }
        });
        res.status(201).json({ success: true, data: tax });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to create tax.' });
    }
});

// GET /api/taxes/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const tax = await prisma.tax.findUnique({ where: { id: req.params.id } });
        if (!tax) return res.status(404).json({ success: false, error: 'Tax not found.' });
        res.json({ success: true, data: tax });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch tax.' });
    }
});

// PUT /api/taxes/:id
router.put('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { name, taxType, percentage, isActive, description } = req.body;
        const tax = await prisma.tax.update({
            where: { id: req.params.id },
            data: { name, taxType, percentage: percentage ? parseFloat(percentage) : undefined, isActive, description }
        });
        res.json({ success: true, data: tax });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update tax.' });
    }
});

// DELETE /api/taxes/:id
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        await prisma.tax.update({ where: { id: req.params.id }, data: { isActive: false } });
        res.json({ success: true, message: 'Tax deactivated.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to delete tax.' });
    }
});

module.exports = router;
