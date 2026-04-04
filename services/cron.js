const cron = require('node-cron');
const { runBillingCycle, closeExpiredSubscriptions } = require('./billing');
const prisma = require('../lib/prisma');
const { sendRenewalReminderEmail, sendOverdueInvoiceEmail } = require('./email');

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
                    await sendRenewalReminderEmail(sub, sub.customer);
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
                    await sendOverdueInvoiceEmail(inv, inv.customer);
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
