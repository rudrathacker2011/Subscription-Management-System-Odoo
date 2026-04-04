const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const customerFilter = req.user.role === 'PORTAL' ? { customerId: req.user.id } : {};

        const [
            activeSubscriptions,
            overdueCount,
            statusBreakdown,
            totalPayments
        ] = await Promise.all([
            prisma.subscription.count({ where: { ...customerFilter, status: 'ACTIVE' } }),
            prisma.invoice.count({ where: { ...customerFilter, status: { in: ['DRAFT', 'CONFIRMED'] }, dueDate: { lt: now } } }),
            prisma.subscription.groupBy({ by: ['status'], where: customerFilter, _count: { status: true } }),
            prisma.payment.aggregate({ where: customerFilter, _sum: { amount: true } })
        ]);

        // True MRR: sum of active subscription plan prices
        const activeSubs = await prisma.subscription.findMany({
            where: { ...customerFilter, status: 'ACTIVE' },
            include: { plan: { select: { price: true, billingPeriod: true } } }
        });
        const mrr = activeSubs.reduce((sum, s) => {
            const p = s.plan?.price || 0;
            const period = s.plan?.billingPeriod;
            if (period === 'MONTHLY') return sum + p;
            if (period === 'YEARLY') return sum + p / 12;
            if (period === 'WEEKLY') return sum + p * 4.33;
            if (period === 'DAILY') return sum + p * 30;
            return sum + p;
        }, 0);

        // Monthly payments (this calendar month)
        const monthlyPayments = await prisma.payment.aggregate({
            where: { ...customerFilter, paymentDate: { gte: startOfMonth } },
            _sum: { amount: true }
        });


        // Revenue chart (last 6 months)
        const revenueChart = [];
        for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const agg = await prisma.payment.aggregate({
                where: { ...customerFilter, paymentDate: { gte: monthStart, lte: monthEnd } },
                _sum: { amount: true }
            });
            revenueChart.push({
                month: monthStart.toLocaleString('default', { month: 'short', year: '2-digit' }),
                revenue: agg._sum.amount || 0
            });
        }

        // Top 5 customers (Admin/Internal only)
        let topCustomers = [];
        if (req.user.role !== 'PORTAL') {
            const topRaw = await prisma.payment.groupBy({
                by: ['customerId'], _sum: { amount: true },
                orderBy: { _sum: { amount: 'desc' } }, take: 5
            });
            const customerIds = topRaw.map(t => t.customerId);
            const customers = await prisma.user.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, email: true } });
            topCustomers = topRaw.map(t => ({
                ...customers.find(c => c.id === t.customerId),
                totalRevenue: t._sum.amount || 0
            }));
        }

        res.json({
            success: true,
            data: {
                activeSubscriptions,
                mrr: Math.round(mrr),
                monthlyPayments: monthlyPayments._sum.amount || totalPayments._sum.amount || 0,
                overdueInvoices: overdueCount,
                revenueChart,
                topCustomers,
                statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.status }))
            }
        });

    } catch (err) {
        console.error('[REPORTS] Dashboard error:', err);
        res.status(500).json({ success: false, error: 'Failed to load dashboard.' });
    }
});

// GET /api/reports/revenue
router.get('/revenue', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { startDate, endDate, customerId } = req.query;
        const where = {};
        if (startDate || endDate) {
            where.paymentDate = {};
            if (startDate) where.paymentDate.gte = new Date(startDate);
            if (endDate) where.paymentDate.lte = new Date(endDate);
        }
        if (customerId) where.customerId = customerId;

        const payments = await prisma.payment.findMany({
            where, include: { customer: { select: { name: true } }, invoice: { select: { invoiceNumber: true } } },
            orderBy: { paymentDate: 'asc' }
        });

        const total = payments.reduce((sum, p) => sum + p.amount, 0);
        const byMonth = {};
        payments.forEach(p => {
            const key = new Date(p.paymentDate).toLocaleString('default', { month: 'short', year: '2-digit' });
            byMonth[key] = (byMonth[key] || 0) + p.amount;
        });

        res.json({ success: true, data: { payments, total, byMonth: Object.entries(byMonth).map(([month, revenue]) => ({ month, revenue })) } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load revenue report.' });
    }
});

// GET /api/reports/subscriptions
router.get('/subscriptions', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { status, planId } = req.query;
        const where = {};
        if (status) where.status = status;
        if (planId) where.planId = planId;

        const [subscriptions, byStatus, byPlan] = await Promise.all([
            prisma.subscription.findMany({ where, include: { customer: { select: { name: true } }, plan: { select: { name: true, billingPeriod: true } } } }),
            prisma.subscription.groupBy({ by: ['status'], _count: { status: true } }),
            prisma.subscription.groupBy({ by: ['planId'], _count: { planId: true } })
        ]);

        const plans = await prisma.recurringPlan.findMany({ select: { id: true, name: true } });
        const byPlanNamed = byPlan.map(b => ({ plan: plans.find(p => p.id === b.planId)?.name || b.planId, count: b._count.planId }));

        res.json({ success: true, data: { subscriptions, byStatus: byStatus.map(s => ({ status: s.status, count: s._count.status })), byPlan: byPlanNamed } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load subscription report.' });
    }
});

// GET /api/reports/payments
router.get('/payments', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const where = {};
        if (startDate || endDate) {
            where.paymentDate = {};
            if (startDate) where.paymentDate.gte = new Date(startDate);
            if (endDate) where.paymentDate.lte = new Date(endDate);
        }

        const [byMethod, totalInvoiced, totalPaid] = await Promise.all([
            prisma.payment.groupBy({ by: ['paymentMethod'], where, _sum: { amount: true }, _count: { paymentMethod: true } }),
            prisma.invoice.aggregate({ _sum: { total: true } }),
            prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { total: true } })
        ]);

        const collectionRate = totalInvoiced._sum.total > 0
            ? ((totalPaid._sum.total || 0) / totalInvoiced._sum.total * 100).toFixed(1)
            : 0;

        res.json({
            success: true,
            data: {
                byMethod: byMethod.map(m => ({ method: m.paymentMethod, total: m._sum.amount || 0, count: m._count.paymentMethod })),
                totalInvoiced: totalInvoiced._sum.total || 0,
                totalPaid: totalPaid._sum.total || 0,
                collectionRate: parseFloat(collectionRate)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load payment report.' });
    }
});

// GET /api/reports/overdue
router.get('/overdue', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const now = new Date();
        const overdue = await prisma.invoice.findMany({
            where: { status: { in: ['DRAFT', 'CONFIRMED'] }, dueDate: { lt: now } },
            include: { customer: { select: { name: true, email: true } }, subscription: { select: { subscriptionNumber: true } } },
            orderBy: { dueDate: 'asc' }
        });

        // Aging buckets
        const aging = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
        overdue.forEach(inv => {
            const daysDue = Math.floor((now - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
            if (daysDue <= 30) aging['0-30'].push(inv);
            else if (daysDue <= 60) aging['31-60'].push(inv);
            else if (daysDue <= 90) aging['61-90'].push(inv);
            else aging['90+'].push(inv);
        });

        res.json({ success: true, data: { overdue, aging: { '0-30': aging['0-30'].length, '31-60': aging['31-60'].length, '61-90': aging['61-90'].length, '90+': aging['90+'].length } } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load overdue report.' });
    }
});

// GET /api/reports/customers/top
router.get('/customers/top', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const topRaw = await prisma.payment.groupBy({
            by: ['customerId'], _sum: { amount: true },
            orderBy: { _sum: { amount: 'desc' } }, take: 10
        });

        const customerIds = topRaw.map(t => t.customerId);
        const [customers, subCounts] = await Promise.all([
            prisma.user.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, email: true, companyName: true } }),
            prisma.subscription.groupBy({ by: ['customerId'], where: { customerId: { in: customerIds } }, _count: { customerId: true } })
        ]);

        const result = topRaw.map(t => ({
            ...customers.find(c => c.id === t.customerId),
            totalRevenue: t._sum.amount || 0,
            subscriptionCount: subCounts.find(s => s.customerId === t.customerId)?._count.customerId || 0
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load customer report.' });
    }
});

// GET /api/reports/stats (For Reports Page)
router.get('/stats', requireAuth, requireRole(['ADMIN', 'INTERNAL']), async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            activeCount,
            unpaidAgg,
            planBreakdown,
            payments
        ] = await Promise.all([
            prisma.subscription.count({ where: { status: 'ACTIVE' } }),
            prisma.invoice.aggregate({
                where: { status: { in: ['DRAFT', 'CONFIRMED'] } },
                _sum: { amountDue: true }
            }),
            prisma.subscription.groupBy({
                by: ['planId'],
                where: { status: 'ACTIVE' },
                _count: { planId: true }
            }),
            prisma.payment.findMany({
                where: { paymentDate: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
                select: { amount: true, paymentDate: true }
            })
        ]);

        // MRR
        const activeSubs = await prisma.subscription.findMany({
            where: { status: 'ACTIVE' },
            include: { plan: { select: { price: true, billingPeriod: true } } }
        });
        const mrr = activeSubs.reduce((sum, s) => {
            const p = s.plan?.price || 0;
            const period = s.plan?.billingPeriod;
            if (period === 'MONTHLY') return sum + p;
            if (period === 'YEARLY') return sum + p / 12;
            if (period === 'WEEKLY') return sum + p * 4.33;
            if (period === 'DAILY') return sum + p * 30;
            return sum + p;
        }, 0);

        // Revenue over 6 months
        const revenueSixMonths = [];
        for (let i = 5; i >= 0; i--) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthlySum = payments
                .filter(p => p.paymentDate >= mStart && p.paymentDate <= mEnd)
                .reduce((sum, p) => sum + p.amount, 0);
            
            revenueSixMonths.push({
                month: mStart.toLocaleString('default', { month: 'short' }),
                revenue: monthlySum
            });
        }

        // Plan breakdown names
        const plans = await prisma.recurringPlan.findMany({ select: { id: true, name: true } });
        const subsByPlan = planBreakdown.map(pb => ({
            planName: plans.find(p => p.id === pb.planId)?.name || 'Unknown',
            count: pb._count.planId
        }));

        res.json({
            success: true,
            data: {
                mrr: Math.round(mrr),
                activeSubscriptions: activeCount,
                unpaidAmount: unpaidAgg._sum.amountDue || 0,
                revenueSixMonths,
                subsByPlan
            }
        });
    } catch (err) {
        console.error('[REPORTS] Stats error:', err);
        res.status(500).json({ success: false, error: 'Failed to load report stats.' });
    }
});

module.exports = router;
