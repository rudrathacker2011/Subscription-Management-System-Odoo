const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/discounts
router.get('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { search, isActive, appliesTo } = req.query;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (appliesTo) where.appliesTo = appliesTo;

        const discounts = await prisma.discount.findMany({ where, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: discounts });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch discounts.' });
    }
});

// POST /api/discounts (Admin only)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { name, code, discountType, value, minPurchaseAmount, minQuantity, startDate, endDate, limitUsage, appliesTo } = req.body;
        if (!name || !code || value === undefined)
            return res.status(400).json({ success: false, error: 'Name, code, and value are required.' });

        const existing = await prisma.discount.findUnique({ where: { code } });
        if (existing) return res.status(400).json({ success: false, error: 'Discount code already exists.' });

        const discount = await prisma.discount.create({
            data: {
                name, code: code.toUpperCase(), discountType: discountType || 'PERCENTAGE',
                value: parseFloat(value),
                minPurchaseAmount: minPurchaseAmount ? parseFloat(minPurchaseAmount) : null,
                minQuantity: minQuantity ? parseInt(minQuantity) : null,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                limitUsage: limitUsage ? parseInt(limitUsage) : null,
                appliesTo: appliesTo || 'BOTH'
            }
        });
        res.status(201).json({ success: true, data: discount });
    } catch (err) {
        console.error('[DISCOUNTS] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create discount.' });
    }
});

// GET /api/discounts/:id
router.get('/:id', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const discount = await prisma.discount.findUnique({ where: { id: req.params.id } });
        if (!discount) return res.status(404).json({ success: false, error: 'Discount not found.' });
        res.json({ success: true, data: discount });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch discount.' });
    }
});

// PUT /api/discounts/:id (Admin only)
router.put('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const disc = await prisma.discount.findUnique({ where: { id: req.params.id } });
        if (!disc) return res.status(404).json({ success: false, error: 'Discount not found.' });
        if (disc.currentUsage > 0)
            return res.status(400).json({ success: false, error: 'Cannot edit a discount that has already been used.' });

        const { name, discountType, value, minPurchaseAmount, minQuantity, startDate, endDate, limitUsage, appliesTo, isActive } = req.body;
        const discount = await prisma.discount.update({
            where: { id: req.params.id },
            data: {
                name, discountType, value: value ? parseFloat(value) : undefined,
                minPurchaseAmount: minPurchaseAmount ? parseFloat(minPurchaseAmount) : null,
                minQuantity: minQuantity ? parseInt(minQuantity) : null,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                limitUsage: limitUsage ? parseInt(limitUsage) : null,
                appliesTo, isActive
            }
        });
        res.json({ success: true, data: discount });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update discount.' });
    }
});

// DELETE /api/discounts/:id (Admin only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const disc = await prisma.discount.findUnique({ where: { id: req.params.id } });
        if (disc?.currentUsage > 0)
            return res.status(400).json({ success: false, error: 'Cannot delete a discount that has been used.' });

        await prisma.discount.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Discount deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to delete discount.' });
    }
});

// POST /api/discounts/validate
router.post('/validate', requireAuth, async (req, res) => {
    try {
        const { code, amount, quantity } = req.body;
        const discount = await prisma.discount.findUnique({ where: { code: code?.toUpperCase() } });

        if (!discount || !discount.isActive)
            return res.status(400).json({ success: false, error: 'Invalid or inactive discount code.' });

        const now = new Date();
        if (discount.startDate && discount.startDate > now)
            return res.status(400).json({ success: false, error: 'Discount is not yet active.' });
        if (discount.endDate && discount.endDate < now)
            return res.status(400).json({ success: false, error: 'Discount has expired.' });
        if (discount.limitUsage && discount.currentUsage >= discount.limitUsage)
            return res.status(400).json({ success: false, error: 'Discount usage limit reached.' });
        if (discount.minPurchaseAmount && amount < discount.minPurchaseAmount)
            return res.status(400).json({ success: false, error: `Minimum purchase of ₹${discount.minPurchaseAmount} required.` });
        if (discount.minQuantity && quantity < discount.minQuantity)
            return res.status(400).json({ success: false, error: `Minimum quantity of ${discount.minQuantity} required.` });

        const discountValue = discount.discountType === 'PERCENTAGE'
            ? parseFloat(amount) * (discount.value / 100)
            : discount.value;

        res.json({ success: true, discount, discountValue: Math.min(discountValue, parseFloat(amount) || 0) });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to validate discount.' });
    }
});

module.exports = router;
