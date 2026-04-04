const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/products
router.get('/', requireAuth, async (req, res) => {
    try {
        const { search, type, isActive, page = 1, limit = 20 } = req.query;
        const where = {};
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (type) where.productType = type;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [products, total] = await Promise.all([
            prisma.product.findMany({ where, include: { variants: true }, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' } }),
            prisma.product.count({ where })
        ]);

        res.json({ success: true, data: products, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) {
        console.error('[PRODUCTS] List error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch products.' });
    }
});

// POST /api/products
router.post('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { name, productType, salesPrice, costPrice, description, isActive, supportsRecurring } = req.body;
        if (!name || salesPrice === undefined)
            return res.status(400).json({ success: false, error: 'Name and sales price are required.' });

        const product = await prisma.product.create({
            data: { name, productType: productType || 'SERVICE', salesPrice: parseFloat(salesPrice), costPrice: costPrice ? parseFloat(costPrice) : null, description, isActive: isActive !== false, supportsRecurring: supportsRecurring !== false }
        });
        res.status(201).json({ success: true, data: product });
    } catch (err) {
        console.error('[PRODUCTS] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create product.' });
    }
});

// GET /api/products/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { variants: true } });
        if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch product.' });
    }
});

// PUT /api/products/:id
router.put('/:id', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { name, productType, salesPrice, costPrice, description, isActive, supportsRecurring } = req.body;
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { name, productType, salesPrice: salesPrice ? parseFloat(salesPrice) : undefined, costPrice: costPrice ? parseFloat(costPrice) : undefined, description, isActive, supportsRecurring }
        });
        res.json({ success: true, data: product });
    } catch (err) {
        console.error('[PRODUCTS] Update error:', err);
        res.status(500).json({ success: false, error: 'Failed to update product.' });
    }
});

// DELETE /api/products/:id (soft delete)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        // Check if used in active subscriptions
        const activeCount = await prisma.subscriptionLineItem.count({
            where: { productId: req.params.id, subscription: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }
        });
        if (activeCount > 0)
            return res.status(400).json({ success: false, error: 'Cannot delete product used in active subscriptions.' });

        await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
        res.json({ success: true, message: 'Product deactivated.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to delete product.' });
    }
});

// GET /api/products/:id/variants
router.get('/:id/variants', requireAuth, async (req, res) => {
    try {
        const variants = await prisma.productVariant.findMany({ where: { productId: req.params.id } });
        res.json({ success: true, data: variants });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch variants.' });
    }
});

// POST /api/products/:id/variants
router.post('/:id/variants', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { attribute, value, extraPrice } = req.body;
        if (!attribute || !value)
            return res.status(400).json({ success: false, error: 'Attribute and value are required.' });

        const variant = await prisma.productVariant.create({
            data: { attribute, value, extraPrice: parseFloat(extraPrice) || 0, productId: req.params.id }
        });
        res.status(201).json({ success: true, data: variant });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to create variant.' });
    }
});

// DELETE /api/products/:id/variants/:variantId
router.delete('/:id/variants/:variantId', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        await prisma.productVariant.delete({ where: { id: req.params.variantId } });
        res.json({ success: true, message: 'Variant deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to delete variant.' });
    }
});

module.exports = router;
