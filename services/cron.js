const cron = require('node-cron');
const { runBillingCycle, closeExpiredSubscriptions } = require('./billing');
const prisma = require('../lib/prisma');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASSWORD }
});

function startCronJobs() {
    console.log('🕐 [CRON] Starting scheduled jobs...');

    // --- DAILY BILLING (00:00 UTC) ---
    cron.schedule('0 0 * * *', async () => {
        console.log('🔄 [CRON] Running daily billing cycle...');
        try {
            await runBillingCycle();
        } catch (err) {
            console.error('❌ [CRON] Billing cycle error:', err);
        }
    });

    // --- SUBSCRIPTION EXPIRY CHECK (00:05 UTC) ---
    cron.schedule('5 0 * * *', async () => {
        console.log('🔄 [CRON] Checking expired subscriptions...');
        try {
            await closeExpiredSubscriptions();
        } catch (err) {
            console.error('❌ [CRON] Expiry check error:', err);
        }
    });

    // --- RENEWAL REMINDERS (09:00 UTC) ---
    cron.schedule('0 9 * * *', async () => {
        console.log('🔄 [CRON] Sending renewal reminders...');
        try {
            const target = new Date();
            target.setDate(target.getDate() + 7);
            const start = new Date(target); start.setHours(0, 0, 0, 0);
            const end = new Date(target); end.setHours(23, 59, 59, 999);

            const subscriptions = await prisma.subscription.findMany({
                where: { status: 'ACTIVE', isPaused: false, nextBillingDate: { gte: start, lte: end } },
                include: { customer: true, plan: true }
            });

            for (const sub of subscriptions) {
                try {
                    await transporter.sendMail({
                        from: process.env.EMAIL_FROM,
                        to: sub.customer.email,
                        subject: `🔔 Renewal Reminder — ${sub.subscriptionNumber}`,
                        html: `<p>Hi ${sub.customer.name},</p><p>Your subscription <strong>${sub.subscriptionNumber}</strong> (${sub.plan.name}) will renew in 7 days on <strong>${new Date(sub.nextBillingDate).toLocaleDateString()}</strong>.</p><p>Log in to your portal to manage your subscription.</p>`
                    });
                } catch (mailErr) {
                    console.error(`❌ [CRON] Reminder email failed for ${sub.subscriptionNumber}:`, mailErr.message);
                }
            }
            console.log(`✅ [CRON] Sent ${subscriptions.length} renewal reminders`);
        } catch (err) {
            console.error('❌ [CRON] Renewal reminders error:', err);
        }
    });

    // --- OVERDUE INVOICE ALERTS (Every 6 hours) ---
    cron.schedule('0 */6 * * *', async () => {
        console.log('🔄 [CRON] Checking overdue invoices...');
        try {
            const overdue = await prisma.invoice.findMany({
                where: { status: { in: ['DRAFT', 'CONFIRMED'] }, dueDate: { lt: new Date() } },
                include: { customer: true }
            });

            for (const inv of overdue) {
                try {
                    await transporter.sendMail({
                        from: process.env.EMAIL_FROM,
                        to: inv.customer.email,
                        subject: `⚠️ Overdue Invoice ${inv.invoiceNumber}`,
                        html: `<p>Hi ${inv.customer.name},</p><p>Invoice <strong>${inv.invoiceNumber}</strong> of <strong>₹${inv.amountDue.toFixed(2)}</strong> is overdue since ${new Date(inv.dueDate).toLocaleDateString()}.</p><p>Please log in to settle this at your earliest convenience.</p>`
                    });
                } catch (mailErr) {
                    console.error(`❌ [CRON] Overdue email failed for ${inv.invoiceNumber}:`, mailErr.message);
                }
            }
            console.log(`✅ [CRON] Sent ${overdue.length} overdue alerts`);
        } catch (err) {
            console.error('❌ [CRON] Overdue alerts error:', err);
        }
    });

    console.log('✅ [CRON] All jobs scheduled');
}

module.exports = { startCronJobs };
