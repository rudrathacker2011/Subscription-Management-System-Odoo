const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// --- FETCH FULL CATALOG & PLANS ---
router.get('/', requireAuth, async (req, res) => {
    try {
        // Fetch all products with their variants
        const products = await prisma.product.findMany({
            include: {
                variants: true
            }
        });

        // Fetch all available recurring plans
        const plans = await prisma.plan.findMany();

        res.status(200).json({
            message: "Ignite Catalog loaded.",
            products,
            plans
        });
    } catch (error) {
        console.error('[CATALOG ERROR]', error);
        res.status(500).json({ error: "Failed to load sub-commerce catalog." });
    }
});

module.exports = router;
