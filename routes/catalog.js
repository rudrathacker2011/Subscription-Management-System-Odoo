const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// --- GET /api/catalog — Fetch all active products & plans ---
router.get('/', requireAuth, async (req, res) => {
    try {
        const { search, type } = req.query;
        const productWhere = { isActive: true };
        if (search) productWhere.name = { contains: search, mode: 'insensitive' };
        if (type) productWhere.productType = type;

        const [products, plans] = await Promise.all([
            prisma.product.findMany({
                where: productWhere,
                include: { variants: true },
                orderBy: { name: 'asc' }
            }),
            prisma.recurringPlan.findMany({
                orderBy: { price: 'asc' }
            })
        ]);

        res.json({
            success: true,
            data: { products, plans }
        });
    } catch (error) {
        console.error('[CATALOG ERROR]', error);
        res.status(500).json({ success: false, error: 'Failed to load catalog.' });
    }
});

module.exports = router;
