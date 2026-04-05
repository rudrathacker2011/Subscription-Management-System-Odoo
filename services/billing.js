const prisma = require('../lib/prisma');

/**
 * Calculate the next billing date based on billing period
 */
function calculateNextBillingDate(billingPeriod, fromDate) {
    const date = new Date(fromDate);
    switch (billingPeriod) {
        case 'DAILY':   date.setDate(date.getDate() + 1); break;
        case 'WEEKLY':  date.setDate(date.getDate() + 7); break;
        case 'MONTHLY': date.setMonth(date.getMonth() + 1); break;
        case 'YEARLY':  date.setFullYear(date.getFullYear() + 1); break;
        default:        date.setMonth(date.getMonth() + 1);
    }
    return date;
}

function generateInvNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 90000) + 10000;
    return `INV-${year}-${rand}`;
}

/**
 * Generate an invoice for a given subscription
 */
async function generateInvoiceForSubscription(subscriptionId) {
    const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
            customer: true,
            plan: true,
            lineItems: { include: { product: true, variant: true, discount: true, taxes: { include: { tax: true } } } }
        }
    });

    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);

    let subtotal = 0, discountAmount = 0, taxAmount = 0;

    const invoiceLineItems = subscription.lineItems.map(item => {
        const lineSubtotal = item.quantity * item.unitPrice;
        let lineDiscount = 0;
        if (item.discount && item.discount.isActive) {
            lineDiscount = item.discount.discountType === 'PERCENTAGE'
                ? lineSubtotal * (item.discount.value / 100)
                : item.discount.value;
        }
        
        const lineAfterDiscount = lineSubtotal - lineDiscount;
        let lineTax = 0;
        if (item.taxes && item.taxes.length > 0) {
            for (const t of item.taxes) {
                if (t.tax && t.tax.isActive) {
                    lineTax += lineAfterDiscount * (t.tax.percentage / 100);
                }
            }
        }

        subtotal += lineSubtotal;
        discountAmount += lineDiscount;
        taxAmount += lineTax;

        return {
            productId: item.productId,
            description: `${item.product.name}${item.variant ? ` (${item.variant.value})` : ''}`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: lineAfterDiscount + lineTax,
            discountId: item.discountId || null
        };
    });

    const total = subtotal - discountAmount + taxAmount;

    let invNumber;
    let unique = false;
    while (!unique) {
        invNumber = generateInvNumber();
        const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: invNumber } });
        if (!exists) unique = true;
    }

    // Calculate due date (Net 30 default)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await prisma.invoice.create({
        data: {
            invoiceNumber: invNumber,
            customerId: subscription.customerId,
            subscriptionId: subscription.id,
            status: 'CONFIRMED',
            subtotal, taxAmount, discountAmount, total,
            amountPaid: 0, amountDue: total,
            dueDate,
            lineItems: { create: invoiceLineItems }
        }
    });

    // Update next billing date
    const nextBilling = calculateNextBillingDate(subscription.plan.billingPeriod, subscription.nextBillingDate || new Date());
    await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { nextBillingDate: nextBilling }
    });

    console.log(`✅ [BILLING] Invoice ${invNumber} generated for subscription ${subscription.subscriptionNumber}`);
    return invoice;
}

/**
 * Run billing cycle — called by cron job
 */
async function runBillingCycle() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dueSubscriptions = await prisma.subscription.findMany({
        where: {
            status: 'ACTIVE',
            isPaused: false,
            nextBillingDate: { gte: today, lt: tomorrow }
        }
    });

    console.log(`🔄 [BILLING] Processing ${dueSubscriptions.length} subscriptions...`);

    for (const sub of dueSubscriptions) {
        try {
            await generateInvoiceForSubscription(sub.id);
        } catch (err) {
            console.error(`❌ [BILLING] Failed for subscription ${sub.id}:`, err.message);
        }
    }
}

/**
 * Close expired subscriptions
 */
async function closeExpiredSubscriptions() {
    const today = new Date();
    const updated = await prisma.subscription.updateMany({
        where: { status: 'ACTIVE', expirationDate: { lt: today } },
        data: { status: 'CLOSED' }
    });
    if (updated.count > 0) {
        console.log(`✅ [BILLING] Closed ${updated.count} expired subscriptions`);
    }
}

module.exports = { generateInvoiceForSubscription, calculateNextBillingDate, runBillingCycle, closeExpiredSubscriptions };
