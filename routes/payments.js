const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, requireOwnershipOrAdmin } = require('../middleware/auth');

const router = express.Router();

function generatePayNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 90000) + 10000;
    return `PAY-${year}-${rand}`;
}

// GET /api/payments
router.get('/', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const { customerId, invoiceId, method, startDate, endDate, page = 1, limit = 20 } = req.query;
        const where = {};
        if (req.portalFilter) where.customerId = req.user.id;
        if (customerId && !req.portalFilter) where.customerId = customerId;
        if (invoiceId) where.invoiceId = invoiceId;
        if (method) where.paymentMethod = method;
        if (startDate || endDate) {
            where.paymentDate = {};
            if (startDate) where.paymentDate.gte = new Date(startDate);
            if (endDate) where.paymentDate.lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                include: {
                    invoice: { select: { invoiceNumber: true, total: true } },
                    customer: { select: { id: true, name: true, email: true } }
                },
                skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }
            }),
            prisma.payment.count({ where })
        ]);

        res.json({ success: true, data: payments, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) {
        console.error('[PAYMENTS] List error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch payments.' });
    }
});

// POST /api/payments
router.post('/', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { invoiceId, amount, paymentMethod, paymentDate, referenceNumber, notes } = req.body;
        if (!invoiceId || !amount) return res.status(400).json({ success: false, error: 'Invoice and amount are required.' });

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
        if (invoice.status === 'CANCELLED') return res.status(400).json({ success: false, error: 'Cannot pay a cancelled invoice.' });

        const payAmt = parseFloat(amount);
        if (payAmt <= 0) return res.status(400).json({ success: false, error: 'Amount must be greater than 0.' });
        if (payAmt > invoice.amountDue) return res.status(400).json({ success: false, error: `Amount exceeds outstanding balance of ₹${invoice.amountDue.toFixed(2)}.` });

        let payNumber;
        let unique = false;
        while (!unique) {
            payNumber = generatePayNumber();
            const exists = await prisma.payment.findUnique({ where: { paymentNumber: payNumber } });
            if (!exists) unique = true;
        }

        const payment = await prisma.payment.create({
            data: {
                paymentNumber: payNumber, invoiceId, customerId: invoice.customerId,
                amount: payAmt, paymentMethod: paymentMethod || 'CASH',
                paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                referenceNumber, notes, createdBy: req.user.id
            }
        });

        // Update invoice amounts
        const newAmountPaid = invoice.amountPaid + payAmt;
        const newAmountDue = invoice.total - newAmountPaid;
        const newStatus = newAmountDue <= 0 ? 'PAID' : invoice.status;

        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { amountPaid: newAmountPaid, amountDue: Math.max(0, newAmountDue), status: newStatus }
        });

        res.status(201).json({ success: true, data: payment, invoiceStatus: newStatus });
    } catch (err) {
        console.error('[PAYMENTS] Create error:', err);
        res.status(500).json({ success: false, error: 'Failed to record payment.' });
    }
});

// GET /api/payments/:id
router.get('/:id', requireAuth, requireOwnershipOrAdmin, async (req, res) => {
    try {
        const payment = await prisma.payment.findUnique({
            where: { id: req.params.id },
            include: {
                invoice: { select: { invoiceNumber: true, total: true, status: true } },
                customer: { select: { id: true, name: true, email: true } }
            }
        });
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found.' });
        if (req.portalFilter && payment.customerId !== req.user.id)
            return res.status(403).json({ success: false, error: 'Access denied.' });

        res.json({ success: true, data: payment });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch payment.' });
    }
});

module.exports = router;
