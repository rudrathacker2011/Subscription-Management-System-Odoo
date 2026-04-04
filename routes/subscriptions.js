const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole, requireOwnershipOrAdmin } = require('../middleware/auth');
const { generateInvoiceForSubscription, calculateNextBillingDate } = require('../services/billing');
const { createNotification } = require('./notifications');
const {
    sendSubscriptionRequestedEmail,
    sendAdminNewRequestEmail,
    sendStaffApprovalNeededEmail,
    sendSubscriptionActivatedEmail,
    sendSubscriptionRejectedEmail
} = require('../services/email');

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

// POST /api/subscriptions (Admin/Internal create)
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

// ============================================================
// PORTAL USER — SUBSCRIPTION REQUEST (NEW APPROVAL WORKFLOW)
// ============================================================

// POST /api/subscriptions/request — Portal user requests subscription
router.post('/request', requireAuth, async (req, res) => {
    try {
        const { planId, lineItems } = req.body;
        if (!planId || !lineItems || lineItems.length === 0)
            return res.status(400).json({ success: false, error: 'Plan and at least one product are required.' });

        const plan = await prisma.recurringPlan.findUnique({ where: { id: planId } });
        if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });

        const start = new Date();
        const nextBilling = calculateNextBillingDate(plan.billingPeriod, start);

        let subNumber;
        let unique = false;
        while (!unique) {
            subNumber = generateSubNumber();
            const exists = await prisma.subscription.findUnique({ where: { subscriptionNumber: subNumber } });
            if (!exists) unique = true;
        }

        const processedLineItems = [];
        for (const item of lineItems) {
            const product = await prisma.product.findUnique({ where: { id: item.productId } });
            if (!product || !product.isActive) continue;
            const qty = parseInt(item.quantity) || 1;
            const price = product.salesPrice + (item.variantExtraPrice || 0);
            processedLineItems.push({
                productId: item.productId,
                variantId: item.variantId || null,
                quantity: qty,
                unitPrice: price,
                lineTotal: qty * price
            });
        }

        if (processedLineItems.length === 0)
            return res.status(400).json({ success: false, error: 'No valid products selected.' });

        const subscription = await prisma.subscription.create({
            data: {
                subscriptionNumber: subNumber,
                status: 'PENDING_ADMIN_APPROVAL',
                customerId: req.user.id,
                planId,
                startDate: start,
                nextBillingDate: nextBilling,
                createdById: req.user.id,
                lineItems: { create: processedLineItems }
            },
            include: { customer: { select: { id: true, name: true, email: true } }, plan: true, lineItems: { include: { product: true } } }
        });

        // Notify all admins
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
        const customer = await prisma.user.findUnique({ where: { id: req.user.id } });

        for (const admin of admins) {
            await createNotification({
                userId: admin.id,
                type: 'subscription_request',
                title: 'New Subscription Request',
                message: `${customer.name} has requested subscription ${subNumber}`,
                link: '/pending-approval.html'
            });
            // Send email (non-blocking)
            sendAdminNewRequestEmail(admin.email, customer, subNumber).catch(err =>
                console.error('[EMAIL] Admin notification failed:', err.message)
            );
        }

        // Notify the requesting user
        await createNotification({
            userId: req.user.id,
            type: 'subscription_request',
            title: 'Request Submitted',
            message: `Your subscription request ${subNumber} has been submitted for approval.`,
            link: `/subscriptions-detail.html?id=${subscription.id}`
        });
        sendSubscriptionRequestedEmail(customer, subNumber).catch(() => {});

        res.status(201).json({ success: true, data: subscription, message: 'Subscription request submitted. Awaiting admin approval.' });
    } catch (err) {
        console.error('[SUBS] Request error:', err);
        res.status(500).json({ success: false, error: 'Failed to submit subscription request.' });
    }
});

// GET /api/subscriptions/pending-admin — List pending admin approval
router.get('/pending-admin', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const subscriptions = await prisma.subscription.findMany({
            where: { status: 'PENDING_ADMIN_APPROVAL' },
            include: {
                customer: { select: { id: true, name: true, email: true, companyName: true } },
                plan: true,
                lineItems: { include: { product: true, variant: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: subscriptions });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch pending subscriptions.' });
    }
});

// GET /api/subscriptions/pending-staff — List pending staff approval
router.get('/pending-staff', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const subscriptions = await prisma.subscription.findMany({
            where: { status: 'PENDING_STAFF_APPROVAL' },
            include: {
                customer: { select: { id: true, name: true, email: true, companyName: true } },
                plan: true,
                lineItems: { include: { product: true, variant: true } },
                approvedByAdmin: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: subscriptions });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch pending subscriptions.' });
    }
});

// POST /api/subscriptions/:id/admin-approve
router.post('/:id/admin-approve', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({
            where: { id: req.params.id },
            include: { customer: true }
        });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (sub.status !== 'PENDING_ADMIN_APPROVAL')
            return res.status(400).json({ success: false, error: 'Subscription is not pending admin approval.' });

        const updated = await prisma.subscription.update({
            where: { id: req.params.id },
            data: {
                status: 'PENDING_STAFF_APPROVAL',
                approvedByAdminId: req.user.id,
                adminApprovedAt: new Date()
            }
        });

        // Notify all staff
        const staffMembers = await prisma.user.findMany({ where: { role: 'INTERNAL', isActive: true } });
        for (const staff of staffMembers) {
            await createNotification({
                userId: staff.id,
                type: 'approval_needed',
                title: 'Approval Required',
                message: `Admin approved ${sub.subscriptionNumber}. Your approval is needed.`,
                link: '/staff-approval.html'
            });
            sendStaffApprovalNeededEmail(staff.email, sub.subscriptionNumber, sub.customer.name).catch(() => {});
        }

        // Notify customer
        await createNotification({
            userId: sub.customerId,
            type: 'approval_needed',
            title: 'Request Under Review',
            message: `Your subscription ${sub.subscriptionNumber} has been approved by admin. Final review in progress.`,
            link: `/subscriptions-detail.html?id=${sub.id}`
        });

        res.json({ success: true, data: updated, message: 'Subscription approved by admin. Forwarded to staff for final approval.' });
    } catch (err) {
        console.error('[SUBS] Admin approve error:', err);
        res.status(500).json({ success: false, error: 'Failed to approve subscription.' });
    }
});

// POST /api/subscriptions/:id/admin-reject
router.post('/:id/admin-reject', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required.' });

        const sub = await prisma.subscription.findUnique({
            where: { id: req.params.id },
            include: { customer: true }
        });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (sub.status !== 'PENDING_ADMIN_APPROVAL')
            return res.status(400).json({ success: false, error: 'Subscription is not pending admin approval.' });

        const updated = await prisma.subscription.update({
            where: { id: req.params.id },
            data: { status: 'REJECTED', rejectionReason: reason }
        });

        // Notify customer
        await createNotification({
            userId: sub.customerId,
            type: 'rejected',
            title: 'Request Rejected',
            message: `Your subscription ${sub.subscriptionNumber} has been rejected. Reason: ${reason}`,
            link: `/subscriptions-detail.html?id=${sub.id}`
        });
        sendSubscriptionRejectedEmail(sub.customer, sub.subscriptionNumber, reason).catch(() => {});

        res.json({ success: true, data: updated, message: 'Subscription rejected.' });
    } catch (err) {
        console.error('[SUBS] Admin reject error:', err);
        res.status(500).json({ success: false, error: 'Failed to reject subscription.' });
    }
});

// POST /api/subscriptions/:id/staff-approve
router.post('/:id/staff-approve', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const sub = await prisma.subscription.findUnique({
            where: { id: req.params.id },
            include: { customer: true }
        });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (sub.status !== 'PENDING_STAFF_APPROVAL')
            return res.status(400).json({ success: false, error: 'Subscription is not pending staff approval.' });

        const updated = await prisma.subscription.update({
            where: { id: req.params.id },
            data: {
                status: 'ACTIVE',
                approvedByStaffId: req.user.id,
                staffApprovedAt: new Date()
            }
        });

        // Generate first invoice
        try {
            await generateInvoiceForSubscription(sub.id);
        } catch (invErr) {
            console.error('[SUBS] Invoice generation failed:', invErr.message);
        }

        // Notify customer
        await createNotification({
            userId: sub.customerId,
            type: 'approved',
            title: 'Subscription Activated! 🎉',
            message: `Your subscription ${sub.subscriptionNumber} is now active!`,
            link: `/subscriptions-detail.html?id=${sub.id}`
        });
        sendSubscriptionActivatedEmail(sub.customer, sub.subscriptionNumber).catch(() => {});

        res.json({ success: true, data: updated, message: 'Subscription activated. First invoice generated.' });
    } catch (err) {
        console.error('[SUBS] Staff approve error:', err);
        res.status(500).json({ success: false, error: 'Failed to approve subscription.' });
    }
});

// POST /api/subscriptions/:id/staff-reject
router.post('/:id/staff-reject', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required.' });

        const sub = await prisma.subscription.findUnique({
            where: { id: req.params.id },
            include: { customer: true }
        });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });
        if (sub.status !== 'PENDING_STAFF_APPROVAL')
            return res.status(400).json({ success: false, error: 'Subscription is not pending staff approval.' });

        const updated = await prisma.subscription.update({
            where: { id: req.params.id },
            data: { status: 'REJECTED', rejectionReason: reason }
        });

        await createNotification({
            userId: sub.customerId,
            type: 'rejected',
            title: 'Request Rejected',
            message: `Your subscription ${sub.subscriptionNumber} was rejected. Reason: ${reason}`,
            link: `/subscriptions-detail.html?id=${sub.id}`
        });
        sendSubscriptionRejectedEmail(sub.customer, sub.subscriptionNumber, reason).catch(() => {});

        res.json({ success: true, data: updated, message: 'Subscription rejected.' });
    } catch (err) {
        console.error('[SUBS] Staff reject error:', err);
        res.status(500).json({ success: false, error: 'Failed to reject subscription.' });
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
                invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
                approvedByAdmin: { select: { name: true } },
                approvedByStaff: { select: { name: true } }
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
