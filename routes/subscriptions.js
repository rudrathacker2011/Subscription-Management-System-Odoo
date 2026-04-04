const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, requireOwnershipOrAdmin } = require('../middleware/auth');
const { generateInvoiceForSubscription, calculateNextBillingDate } = require('../services/billing');

const router = express.Router();

function generateSubNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 90000) + 10000;
    return `SUB-${year}-${rand}`;
}

// GET /api/subscriptions
router.get('/', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const { status, customerId, planId, startDate, endDate, isPaused, page = 1, limit = 20 } = req.query;
        const where = {};
        if (req.portalFilter) where.customerId = req.user.id;
        if (status) where.status = status;
        if (customerId && !req.portalFilter) where.customerId = customerId;
        if (planId) where.planId = planId;
        if (isPaused !== undefined) where.isPaused = isPaused === 'true';
        if (startDate || endDate) {
            where.startDate = {};
            if (startDate) where.startDate.gte = new Date(startDate);
            if (endDate) where.startDate.lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [subscriptions, total] = await Promise.all([
            prisma.subscription.findMany({
                where,
                include: { customer: { select: { id: true, name: true, email: true } }, plan: true, lineItems: { include: { product: true, variant: true } } },
                skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }
            }),
            prisma.subscription.count({ where })
        ]);

        res.json({ success: true, data: subscriptions, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) {
        console.error('[SUBS] List error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch subscriptions.' });
    }
});

// POST /api/subscriptions
router.post('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { customerId, planId, startDate, paymentTerms, lineItems, templateId } = req.body;
        if (!customerId || !planId || !startDate)
            return res.status(400).json({ success: false, error: 'Customer, plan, and start date are required.' });

        let resolvedLineItems = lineItems || [];
        if (templateId && resolvedLineItems.length === 0) {
            const tpl = await prisma.quotationTemplate.findUnique({ where: { id: templateId }, include: { lineItems: { include: { product: true } } } });
            if (tpl) {
                resolvedLineItems = tpl.lineItems.map(li => ({ productId: li.productId, quantity: li.defaultQuantity, unitPrice: li.product.salesPrice }));
            }
        }

        const plan = await prisma.recurringPlan.findUnique({ where: { id: planId } });
        if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });

        const start = new Date(startDate);
        const nextBilling = calculateNextBillingDate(plan.billingPeriod, start);

        let subNumber;
        let unique = false;
        while (!unique) {
            subNumber = generateSubNumber();
            const exists = await prisma.subscription.findUnique({ where: { subscriptionNumber: subNumber } });
            if (!exists) unique = true;
        }

        // Calculate line item totals
        const processedLineItems = resolvedLineItems.map(item => {
            const qty = parseInt(item.quantity) || 1;
            const price = parseFloat(item.unitPrice) || 0;
            return { productId: item.productId, variantId: item.variantId || null, quantity: qty, unitPrice: price, lineTotal: qty * price, discountId: item.discountId || null };
        });

        const subscription = await prisma.subscription.create({
            data: {
                subscriptionNumber: subNumber,
                customerId, planId,
                startDate: start,
                nextBillingDate: nextBilling,
                paymentTerms: paymentTerms || 'NET_30',
                createdById: req.user.id,
                lineItems: { create: processedLineItems }
            },
            include: { customer: { select: { id: true, name: true, email: true } }, plan: true, lineItems: { include: { product: true } } }
        });

        res.status(201).json({ success: true, data: subscription });
    } catch (err) {
        console.error('[SUBS] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create subscription.' });
    }
});

// GET /api/subscriptions/:id
router.get('/:id', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const where = { id: req.params.id };
        if (req.portalFilter) where.customerId = req.user.id;

        const subscription = await prisma.subscription.findFirst({
            where, include: {
                customer: { select: { id: true, name: true, email: true, phone: true, companyName: true } },
                plan: true,
                lineItems: { include: { product: true, variant: true, discount: true, taxes: { include: { tax: true } } } },
                invoices: { orderBy: { createdAt: 'desc' }, take: 10 }
            }
        });

        if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        res.json({ success: true, data: subscription });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch subscription.' });
    }
});

// PUT /api/subscriptions/:id
router.put('/:id', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (!['DRAFT', 'QUOTATION'].includes(sub.status))
            return res.status(400).json({ success: false, error: 'Can only edit subscriptions in Draft or Quotation status.' });

        const { customerId, planId, startDate, paymentTerms, lineItems } = req.body;

        // Delete existing line items and recreate
        if (lineItems) {
            await prisma.subscriptionLineItem.deleteMany({ where: { subscriptionId: req.params.id } });
        }

        const plan = planId ? await prisma.recurringPlan.findUnique({ where: { id: planId } }) : null;
        const newNextBilling = plan ? calculateNextBillingDate(plan.billingPeriod, startDate ? new Date(startDate) : sub.startDate) : undefined;

        const updated = await prisma.subscription.update({
            where: { id: req.params.id },
            data: {
                customerId, planId, paymentTerms,
                startDate: startDate ? new Date(startDate) : undefined,
                nextBillingDate: newNextBilling,
                ...(lineItems && {
                    lineItems: {
                        create: lineItems.map(item => ({
                            productId: item.productId, variantId: item.variantId || null,
                            quantity: parseInt(item.quantity) || 1, unitPrice: parseFloat(item.unitPrice) || 0,
                            lineTotal: (parseInt(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0),
                            discountId: item.discountId || null
                        }))
                    }
                })
            },
            include: { customer: { select: { id: true, name: true, email: true } }, plan: true, lineItems: { include: { product: true } } }
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('[SUBS] Update error:', err);
        res.status(500).json({ success: false, error: 'Failed to update subscription.' });
    }
});

// POST /api/subscriptions/:id/confirm
router.post('/:id/confirm', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (sub.status !== 'DRAFT' && sub.status !== 'QUOTATION')
            return res.status(400).json({ success: false, error: 'Only Draft or Quotation subscriptions can be confirmed.' });

        const updated = await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'CONFIRMED' } });
        // Auto-generate first invoice
        await generateInvoiceForSubscription(sub.id);

        res.json({ success: true, data: updated, message: 'Subscription confirmed and first invoice generated.' });
    } catch (err) {
        console.error('[SUBS] Confirm error:', err);
        res.status(500).json({ success: false, error: 'Failed to confirm subscription.' });
    }
});

// POST /api/subscriptions/:id/activate
router.post('/:id/activate', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
        if (!sub || sub.status !== 'CONFIRMED')
            return res.status(400).json({ success: false, error: 'Only Confirmed subscriptions can be activated.' });

        const updated = await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to activate subscription.' });
    }
});

// POST /api/subscriptions/:id/pause
router.post('/:id/pause', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true } });
        if (!sub || sub.status !== 'ACTIVE') return res.status(400).json({ success: false, error: 'Only Active subscriptions can be paused.' });
        if (!sub.plan.pausable) return res.status(400).json({ success: false, error: 'This plan does not allow pausing.' });

        const updated = await prisma.subscription.update({ where: { id: req.params.id }, data: { isPaused: true } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to pause subscription.' });
    }
});

// POST /api/subscriptions/:id/resume
router.post('/:id/resume', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
        if (!sub || !sub.isPaused) return res.status(400).json({ success: false, error: 'Subscription is not paused.' });

        const updated = await prisma.subscription.update({ where: { id: req.params.id }, data: { isPaused: false } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to resume subscription.' });
    }
});

// POST /api/subscriptions/:id/cancel
router.post('/:id/cancel', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { reason } = req.body;
        const sub = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true } });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (sub.status === 'CLOSED') return res.status(400).json({ success: false, error: 'Subscription is already closed.' });
        if (!sub.plan.closable) return res.status(400).json({ success: false, error: 'This plan does not allow cancellation.' });

        const updated = await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'CLOSED', cancellationReason: reason || null } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to cancel subscription.' });
    }
});

// GET /api/subscriptions/:id/invoices
router.get('/:id/invoices', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const where = { subscriptionId: req.params.id };
        if (req.portalFilter) {
            const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
            if (!sub || sub.customerId !== req.user.id)
                return res.status(403).json({ success: false, error: 'Access denied.' });
        }
        const invoices = await prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: invoices });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch invoices.' });
    }
});

module.exports = router;
