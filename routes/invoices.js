const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, requireOwnershipOrAdmin } = require('../middleware/auth');
const { sendInvoiceEmail } = require('../services/email');

const router = express.Router();

function generateInvNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 90000) + 10000;
    return `INV-${year}-${rand}`;
}

function calcDueDate(paymentTerms) {
    const days = paymentTerms === 'NET_15' ? 15 : paymentTerms === 'NET_60' ? 60 : 30;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}

// GET /api/invoices
router.get('/', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const { status, customerId, startDate, endDate, overdue, page = 1, limit = 20 } = req.query;
        const where = {};
        if (req.portalFilter) where.customerId = req.user.id;
        if (status) where.status = status;
        if (customerId && !req.portalFilter) where.customerId = customerId;
        if (startDate || endDate) {
            where.invoiceDate = {};
            if (startDate) where.invoiceDate.gte = new Date(startDate);
            if (endDate) where.invoiceDate.lte = new Date(endDate);
        }
        if (overdue === 'true') {
            where.status = { in: ['DRAFT', 'CONFIRMED'] };
            where.dueDate = { lt: new Date() };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [invoices, total] = await Promise.all([
            prisma.invoice.findMany({
                where,
                include: { customer: { select: { id: true, name: true, email: true } }, subscription: { select: { subscriptionNumber: true } } },
                skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }
            }),
            prisma.invoice.count({ where })
        ]);

        res.json({ success: true, data: invoices, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) {
        console.error('[INVOICES] List error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch invoices.' });
    }
});

// POST /api/invoices (manual creation)
router.post('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { customerId, subscriptionId, notes, lineItems, paymentTerms } = req.body;
        if (!customerId) return res.status(400).json({ success: false, error: 'Customer is required.' });
        if (!lineItems || lineItems.length === 0) return res.status(400).json({ success: false, error: 'At least one line item is required.' });

        let invNumber;
        let unique = false;
        while (!unique) {
            invNumber = generateInvNumber();
            const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: invNumber } });
            if (!exists) unique = true;
        }

        let subtotal = 0, taxAmount = 0, discountAmount = 0;
        const processedLineItems = [];

        for (const item of lineItems) {
            const qty = parseInt(item.quantity) || 1;
            const price = parseFloat(item.unitPrice) || 0;
            let lineTotal = qty * price;

            if (item.discountId) {
                const disc = await prisma.discount.findUnique({ where: { id: item.discountId } });
                if (disc && disc.isActive) {
                    const da = disc.discountType === 'PERCENTAGE' ? lineTotal * (disc.value / 100) : disc.value;
                    discountAmount += da;
                    lineTotal -= da;
                }
            }

            subtotal += qty * price;
            processedLineItems.push({ productId: item.productId || null, description: item.description || '', quantity: qty, unitPrice: price, lineTotal, discountId: item.discountId || null });
        }

        const total = subtotal + taxAmount - discountAmount;
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: invNumber, customerId, subscriptionId: subscriptionId || null,
                isManual: true, notes, subtotal, taxAmount, discountAmount, total, amountDue: total,
                dueDate: calcDueDate(paymentTerms || 'NET_30'),
                lineItems: { create: processedLineItems }
            },
            include: { customer: { select: { id: true, name: true, email: true } }, lineItems: true }
        });

        res.status(201).json({ success: true, data: invoice });
    } catch (err) {
        console.error('[INVOICES] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to create invoice.' });
    }
});

// GET /api/invoices/:id
router.get('/:id', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const where = { id: req.params.id };
        if (req.portalFilter) where.customerId = req.user.id;

        const invoice = await prisma.invoice.findFirst({
            where,
            include: {
                customer: { select: { id: true, name: true, email: true, companyName: true, billingAddress: true } },
                subscription: { select: { subscriptionNumber: true, plan: true } },
                lineItems: { include: { product: true, discount: true, taxes: { include: { tax: true } } } },
                payments: { orderBy: { createdAt: 'desc' } }
            }
        });

        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
        res.json({ success: true, data: invoice });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch invoice.' });
    }
});

// POST /api/invoices/:id/confirm
router.post('/:id/confirm', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
        if (!invoice || invoice.status !== 'DRAFT')
            return res.status(400).json({ success: false, error: 'Only Draft invoices can be confirmed.' });

        const updated = await prisma.invoice.update({ where: { id: req.params.id }, data: { status: 'CONFIRMED' } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to confirm invoice.' });
    }
});

// POST /api/invoices/:id/cancel
router.post('/:id/cancel', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
        if (!invoice || invoice.status === 'PAID')
            return res.status(400).json({ success: false, error: 'Paid invoices cannot be cancelled.' });

        const updated = await prisma.invoice.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to cancel invoice.' });
    }
});

// POST /api/invoices/:id/send-email
router.post('/:id/send-email', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: req.params.id },
            include: { customer: true }
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

        await sendInvoiceEmail(invoice, invoice.customer);

        res.json({ success: true, message: 'Invoice email sent.' });
    } catch (err) {
        console.error('[INVOICES] Send email error:', err);
        res.status(500).json({ success: false, error: 'Failed to send email.' });
    }
});

// GET /api/invoices/:id/payments
router.get('/:id/payments', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const payments = await prisma.payment.findMany({ where: { invoiceId: req.params.id }, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: payments });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch payments.' });
    }
});

module.exports = router;
