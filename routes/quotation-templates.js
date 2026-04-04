const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/quotation-templates
router.get('/', requireAuth, async (req, res) => {
    try {
        const { search, isActive } = req.query;
        const where = {};
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const templates = await prisma.quotationTemplate.findMany({
            where,
            include: { plan: true, lineItems: { include: { product: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: templates });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch templates.' });
    }
});

// POST /api/quotation-templates
router.post('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { name, validityDays, planId, description, isActive, lineItems } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Template name is required.' });

        const template = await prisma.quotationTemplate.create({
            data: {
                name, validityDays: parseInt(validityDays) || 30, planId: planId || null, description,
                isActive: isActive !== false,
                lineItems: lineItems ? { create: lineItems.map(li => ({ productId: li.productId, defaultQuantity: parseInt(li.defaultQuantity) || 1 })) } : undefined
            },
            include: { plan: true, lineItems: { include: { product: true } } }
        });
        res.status(201).json({ success: true, data: template });
    } catch (err) {
        console.error('[TEMPLATES] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create template.' });
    }
});

// GET /api/quotation-templates/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const template = await prisma.quotationTemplate.findUnique({
            where: { id: req.params.id },
            include: { plan: true, lineItems: { include: { product: true } } }
        });
        if (!template) return res.status(404).json({ success: false, error: 'Template not found.' });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch template.' });
    }
});

// PUT /api/quotation-templates/:id
router.put('/:id', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { name, validityDays, planId, description, isActive, lineItems } = req.body;

        if (lineItems) {
            await prisma.quotationTemplateLineItem.deleteMany({ where: { templateId: req.params.id } });
        }

        const template = await prisma.quotationTemplate.update({
            where: { id: req.params.id },
            data: {
                name, validityDays: validityDays ? parseInt(validityDays) : undefined,
                planId: planId || null, description, isActive,
                ...(lineItems && { lineItems: { create: lineItems.map(li => ({ productId: li.productId, defaultQuantity: parseInt(li.defaultQuantity) || 1 })) } })
            },
            include: { plan: true, lineItems: { include: { product: true } } }
        });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update template.' });
    }
});

// DELETE /api/quotation-templates/:id
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        await prisma.quotationTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Template deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to delete template.' });
    }
});

module.exports = router;
