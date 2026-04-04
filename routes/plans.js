const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/plans
router.get('/', requireAuth, async (req, res) => {
    try {
        const { search, billingPeriod, page = 1, limit = 20 } = req.query;
        const where = {};
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (billingPeriod) where.billingPeriod = billingPeriod;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [plans, total] = await Promise.all([
            prisma.recurringPlan.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' } }),
            prisma.recurringPlan.count({ where })
        ]);

        res.json({ success: true, data: plans, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch plans.' });
    }
});

// POST /api/plans
router.post('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { name, price, billingPeriod, minQuantity, startDate, endDate, autoClose, closable, pausable, renewable, description } = req.body;
        if (!name || price === undefined || !billingPeriod)
            return res.status(400).json({ success: false, error: 'Name, price, and billing period are required.' });

        const validPeriods = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
        if (!validPeriods.includes(billingPeriod))
            return res.status(400).json({ success: false, error: `Billing period must be one of: ${validPeriods.join(', ')}` });

        const plan = await prisma.recurringPlan.create({
            data: {
                name, price: parseFloat(price), billingPeriod,
                minQuantity: parseInt(minQuantity) || 1,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                autoClose: Boolean(autoClose), closable: closable !== false, pausable: pausable !== false, renewable: renewable !== false,
                description
            }
        });
        res.status(201).json({ success: true, data: plan });
    } catch (err) {
        console.error('[PLANS] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create plan.' });
    }
});

// GET /api/plans/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const plan = await prisma.recurringPlan.findUnique({ where: { id: req.params.id } });
        if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });
        res.json({ success: true, data: plan });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch plan.' });
    }
});

// PUT /api/plans/:id
router.put('/:id', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { name, price, billingPeriod, minQuantity, startDate, endDate, autoClose, closable, pausable, renewable, description } = req.body;
        const plan = await prisma.recurringPlan.update({
            where: { id: req.params.id },
            data: {
                name, price: price ? parseFloat(price) : undefined, billingPeriod,
                minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                autoClose, closable, pausable, renewable, description
            }
        });
        res.json({ success: true, data: plan });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update plan.' });
    }
});

// DELETE /api/plans/:id
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const activeCount = await prisma.subscription.count({
            where: { planId: req.params.id, status: { in: ['CONFIRMED', 'ACTIVE'] } }
        });
        if (activeCount > 0)
            return res.status(400).json({ success: false, error: 'Cannot delete plan used in active subscriptions.' });

        await prisma.recurringPlan.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Plan deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to delete plan.' });
    }
});

module.exports = router;
