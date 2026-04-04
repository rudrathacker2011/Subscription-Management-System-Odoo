const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — Get current user's notifications
router.get('/', requireAuth, async (req, res) => {
    try {
        const { unreadOnly, page = 1, limit = 20 } = req.query;
        const where = { userId: req.user.id };
        if (unreadOnly === 'true') where.isRead = false;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                skip, take: parseInt(limit),
                orderBy: { createdAt: 'desc' }
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({ where: { userId: req.user.id, isRead: false } })
        ]);

        res.json({
            success: true,
            data: notifications,
            unreadCount,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (err) {
        console.error('[NOTIFICATIONS] List error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
    }
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req, res) => {
    try {
        const count = await prisma.notification.count({
            where: { userId: req.user.id, isRead: false }
        });
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get unread count.' });
    }
});

// PUT /api/notifications/:id/read — Mark single as read
router.put('/:id/read', requireAuth, async (req, res) => {
    try {
        const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
        if (!notification || notification.userId !== req.user.id)
            return res.status(404).json({ success: false, error: 'Notification not found.' });

        await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
        res.json({ success: true, message: 'Marked as read.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update notification.' });
    }
});

// PUT /api/notifications/read-all — Mark all as read
router.put('/read-all', requireAuth, async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user.id, isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to mark all as read.' });
    }
});

// --- HELPER: Create notification ---
async function createNotification({ userId, type, title, message, link }) {
    try {
        return await prisma.notification.create({
            data: { userId, type, title, message, link }
        });
    } catch (err) {
        console.error('[NOTIFICATION] Create error:', err.message);
    }
}

module.exports = router;
module.exports.createNotification = createNotification;
