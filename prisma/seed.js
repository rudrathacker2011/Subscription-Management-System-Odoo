require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const dbUrl = process.env.DATABASE_URL;

// --- SAMPLE DATA ---
const PRODUCTS = [
    { name: 'Cloud Hosting Pro', productType: 'SERVICE', salesPrice: 1200, costPrice: 400, description: 'High-performance cloud hosting with 99.9% uptime SLA', isActive: true, supportsRecurring: true },
    { name: 'Database Cluster', productType: 'SERVICE', salesPrice: 2500, costPrice: 800, description: 'Distributed PostgreSQL with automatic failover', isActive: true, supportsRecurring: true },
    { name: 'Email Marketing Suite', productType: 'SERVICE', salesPrice: 800, costPrice: 200, description: 'Send up to 100k emails/month with analytics', isActive: true, supportsRecurring: true },
    { name: 'SSL Certificate', productType: 'SERVICE', salesPrice: 500, costPrice: 100, description: 'Wildcard SSL certificate with auto-renewal', isActive: true, supportsRecurring: true },
    { name: 'CDN Accelerator', productType: 'SERVICE', salesPrice: 600, costPrice: 150, description: 'Global CDN with 50+ PoPs worldwide', isActive: true, supportsRecurring: true },
    { name: 'Security Scanner', productType: 'SERVICE', salesPrice: 1500, costPrice: 500, description: 'Daily malware and vulnerability scanning', isActive: true, supportsRecurring: true },
    { name: 'Backup Manager', productType: 'SERVICE', salesPrice: 400, costPrice: 100, description: 'Daily automated backups with 30-day retention', isActive: true, supportsRecurring: true },
    { name: 'Support Package', productType: 'SERVICE', salesPrice: 2000, costPrice: 600, description: '24/7 priority support with 1-hour SLA', isActive: true, supportsRecurring: true },
    { name: 'Analytics Dashboard', productType: 'SERVICE', salesPrice: 700, costPrice: 200, description: 'Real-time business analytics and reporting', isActive: true, supportsRecurring: true },
    { name: 'Dev Workstation Bundle', productType: 'GOOD', salesPrice: 5000, costPrice: 3500, description: 'Full development environment setup kit', isActive: true, supportsRecurring: false },
];

const PLANS = [
    { name: 'Starter Monthly', price: 999, billingPeriod: 'MONTHLY', minQuantity: 1, description: 'Perfect for small teams', pausable: true, closable: true, renewable: true, autoClose: false },
    { name: 'Professional Monthly', price: 2499, billingPeriod: 'MONTHLY', minQuantity: 1, description: 'For growing businesses', pausable: true, closable: true, renewable: true, autoClose: false },
    { name: 'Enterprise Yearly', price: 24999, billingPeriod: 'YEARLY', minQuantity: 1, description: 'Full enterprise package with 20% discount', pausable: false, closable: false, renewable: true, autoClose: false },
    { name: 'Developer Weekly', price: 299, billingPeriod: 'WEEKLY', minQuantity: 1, description: 'Pay-as-you-go developer access', pausable: true, closable: true, renewable: true, autoClose: false },
    { name: 'Corporate Annual', price: 49999, billingPeriod: 'YEARLY', minQuantity: 5, description: 'Multi-seat enterprise solution', pausable: false, closable: false, renewable: true, autoClose: false },
];

const TAXES = [
    { name: 'GST 18%', taxType: 'GST', percentage: 18, description: 'Standard Goods and Services Tax' },
    { name: 'GST 5%', taxType: 'GST', percentage: 5, description: 'Reduced GST rate for essential services' },
    { name: 'GST 28%', taxType: 'GST', percentage: 28, description: 'Premium GST rate' },
];

const DISCOUNTS = [
    { name: 'Summer Sale 2024', code: 'SUMMER2024', discountType: 'PERCENTAGE', value: 10, appliesTo: 'BOTH', limitUsage: 100 },
    { name: 'Flat 500 Off', code: 'FLAT500', discountType: 'FIXED', value: 500, minPurchaseAmount: 2000, appliesTo: 'SUBSCRIPTIONS', limitUsage: 50 },
    { name: 'New Customer 15%', code: 'NEWCUST15', discountType: 'PERCENTAGE', value: 15, appliesTo: 'BOTH', limitUsage: null },
];

async function seed() {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    console.log('🌱 [SEED] Connected to Neon DB');

    // --- USERS ---
    console.log('👤 Creating users...');
    const adminPw = await bcrypt.hash('Admin@123', 10);
    const staffPw = await bcrypt.hash('Staff@123', 10);
    const custPw = await bcrypt.hash('Customer@123', 10);

    const adminRes = await client.query(
        `INSERT INTO "User" (id, name, email, password, role, phone, "companyName", "isActive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id`,
        ['Admin User', 'admin@test.com', adminPw, 'ADMIN', '+91-9876543210', 'SubsManager Inc']
    );
    const admin2Res = await client.query(
        `INSERT INTO "User" (id, name, email, password, role, phone, "companyName", "isActive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id`,
        ['Super Admin', 'superadmin@test.com', adminPw, 'ADMIN', '+91-9876500000', 'SubsManager Inc']
    );
    const staffRes = await client.query(
        `INSERT INTO "User" (id, name, email, password, role, phone, "companyName", "isActive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id`,
        ['Staff User', 'staff@test.com', staffPw, 'INTERNAL', '+91-9876543211', 'SubsManager Inc']
    );

    const custIds = [];
    const customers = [
        ['Rahul Sharma', 'customer@test.com', 'Sharma Enterprises'],
        ['Priya Patel', 'priya@test.com', 'Patel Tech Solutions'],
        ['Arjun Kumar', 'arjun@test.com', 'Kumar Innovations'],
        ['Sneha Singh', 'sneha@test.com', 'Singh Digital'],
        ['Vikram Mehta', 'vikram@test.com', 'Mehta Systems'],
    ];
    for (const [name, email, company] of customers) {
        const r = await client.query(
            `INSERT INTO "User" (id, name, email, password, role, phone, "companyName", "isActive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id`,
            [name, email, custPw, 'PORTAL', '+91-9900000000', company]
        );
        custIds.push(r.rows[0].id);
    }
    console.log(`✅ Created ${customers.length + 3} users`);

    // --- TAXES ---
    console.log('💰 Creating taxes...');
    const taxIds = [];
    for (const tax of TAXES) {
        const r = await client.query(
            `INSERT INTO "Tax" (id, name, "taxType", percentage, "isActive", description, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, true, $4, NOW(), NOW()) RETURNING id`,
            [tax.name, tax.taxType, tax.percentage, tax.description]
        );
        taxIds.push(r.rows[0].id);
    }
    console.log(`✅ Created ${TAXES.length} taxes`);

    // --- DISCOUNTS ---
    console.log('🏷️  Creating discounts...');
    for (const disc of DISCOUNTS) {
        await client.query(
            `INSERT INTO "Discount" (id, name, code, "discountType", value, "appliesTo", "limitUsage", "currentUsage", "isActive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 0, true, NOW(), NOW()) ON CONFLICT (code) DO NOTHING`,
            [disc.name, disc.code, disc.discountType, disc.value, disc.appliesTo, disc.limitUsage]
        );
    }
    console.log(`✅ Created ${DISCOUNTS.length} discounts`);

    // --- PRODUCTS ---
    console.log('📦 Creating products...');
    const productIds = [];
    for (const p of PRODUCTS) {
        const r = await client.query(
            `INSERT INTO "Product" (id, name, "productType", "salesPrice", "costPrice", description, "isActive", "supportsRecurring", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id`,
            [p.name, p.productType, p.salesPrice, p.costPrice, p.description, p.isActive, p.supportsRecurring]
        );
        productIds.push(r.rows[0].id);
    }

    // Add variants to first 3 products
    const variantDefs = [
        { productIdx: 0, attribute: 'Plan', value: 'Basic', extraPrice: 0 },
        { productIdx: 0, attribute: 'Plan', value: 'Premium', extraPrice: 500 },
        { productIdx: 1, attribute: 'Storage', value: '100GB', extraPrice: 0 },
        { productIdx: 1, attribute: 'Storage', value: '500GB', extraPrice: 800 },
        { productIdx: 2, attribute: 'Tier', value: 'Standard', extraPrice: 0 },
        { productIdx: 2, attribute: 'Tier', value: 'Pro', extraPrice: 300 },
    ];
    for (const v of variantDefs) {
        await client.query(
            `INSERT INTO "ProductVariant" (id, attribute, value, "extraPrice", "productId", "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
            [v.attribute, v.value, v.extraPrice, productIds[v.productIdx]]
        );
    }
    console.log(`✅ Created ${PRODUCTS.length} products with variants`);

    // --- PLANS ---
    console.log('📋 Creating plans...');
    const planIds = [];
    for (const plan of PLANS) {
        const r = await client.query(
            `INSERT INTO "RecurringPlan" (id, name, price, "billingPeriod", "minQuantity", "autoClose", "closable", "pausable", "renewable", description, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id`,
            [plan.name, plan.price, plan.billingPeriod, plan.minQuantity, plan.autoClose, plan.closable, plan.pausable, plan.renewable, plan.description]
        );
        planIds.push(r.rows[0].id);
    }
    console.log(`✅ Created ${PLANS.length} plans`);

    // --- QUOTATION TEMPLATE ---
    const tplRes = await client.query(
        `INSERT INTO "QuotationTemplate" (id, name, "validityDays", description, "isActive", "planId", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, true, $4, NOW(), NOW()) RETURNING id`,
        ['Standard Cloud Package', 30, 'Pre-built cloud infrastructure bundle', planIds[0]]
    );
    await client.query(
        `INSERT INTO "QuotationTemplateLineItem" (id, "defaultQuantity", "templateId", "productId") VALUES (gen_random_uuid(), 1, $1, $2), (gen_random_uuid(), 1, $1, $3)`,
        [tplRes.rows[0].id, productIds[0], productIds[1]]
    );
    console.log(`✅ Created quotation template`);

    // --- SUBSCRIPTIONS & INVOICES ---
    console.log('📑 Creating subscriptions, invoices, and payments...');

    const subStatuses = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'CLOSED'];
    const invStatuses = ['DRAFT', 'CONFIRMED', 'PAID', 'PAID'];

    let subCount = 0, invCount = 0, payCount = 0;

    for (let i = 0; i < 20; i++) {
        const custId = custIds[i % custIds.length];
        const planId = planIds[i % planIds.length];
        const prodId = productIds[i % productIds.length];
        const status = subStatuses[i % subStatuses.length];
        const qty = Math.floor(Math.random() * 3) + 1;
        const plan = PLANS[i % PLANS.length];
        const price = plan.price;

        const subNum = `SUB-2024-${String(i + 1).padStart(4, '0')}`;
        const startDate = new Date(2024, Math.floor(i / 2), 1);
        
        const nextBillingDate = new Date(startDate);
        if (plan.billingPeriod === 'MONTHLY') nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        else if (plan.billingPeriod === 'YEARLY') nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        else if (plan.billingPeriod === 'WEEKLY') nextBillingDate.setDate(nextBillingDate.getDate() + 7);

        const subRes = await client.query(
            `INSERT INTO "Subscription" (id, "subscriptionNumber", status, "isPaused", "startDate", "nextBillingDate", "paymentTerms", "customerId", "planId", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, false, $3, $4, 'NET_30', $5, $6, NOW(), NOW()) RETURNING id`,
            [subNum, status, startDate, nextBillingDate, custId, planId]
        );
        const subId = subRes.rows[0].id;

        await client.query(
            `INSERT INTO "SubscriptionLineItem" (id, quantity, "unitPrice", "lineTotal", "subscriptionId", "productId") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [qty, price, qty * price, subId, prodId]
        );
        subCount++;

        // Create invoices for Confirmed/Active/Closed subscriptions
        if (['CONFIRMED', 'ACTIVE', 'CLOSED'].includes(status)) {
            const numInvoices = status === 'ACTIVE' ? Math.floor(Math.random() * 3) + 1 : 1;
            for (let j = 0; j < numInvoices; j++) {
                const invNum = `INV-2024-${String(invCount + 1).padStart(4, '0')}`;
                const invStatus = invStatuses[(invCount) % invStatuses.length];
                const total = qty * price;
                const invoiceDate = new Date(startDate);
                invoiceDate.setMonth(invoiceDate.getMonth() + j);
                const dueDate = new Date(invoiceDate);
                dueDate.setDate(dueDate.getDate() + 30);

                const amountPaid = invStatus === 'PAID' ? total : 0;

                const invRes = await client.query(
                    `INSERT INTO "Invoice" (id, "invoiceNumber", status, "isManual", "invoiceDate", "dueDate", subtotal, "taxAmount", "discountAmount", total, "amountPaid", "amountDue", "customerId", "subscriptionId", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, false, $3, $4, $5, 0, 0, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING id`,
                    [invNum, invStatus, invoiceDate, dueDate, total, total, amountPaid, total - amountPaid, custId, subId]
                );
                const invId = invRes.rows[0].id;

                await client.query(
                    `INSERT INTO "InvoiceLineItem" (id, description, quantity, "unitPrice", "lineTotal", "invoiceId", "productId") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
                    [PRODUCTS[i % PRODUCTS.length].name, qty, price, qty * price, invId, prodId]
                );
                invCount++;

                // Add payment for PAID invoices
                if (invStatus === 'PAID') {
                    const methods = ['CASH', 'CARD', 'BANK_TRANSFER', 'UPI'];
                    const payNum = `PAY-2024-${String(payCount + 1).padStart(4, '0')}`;
                    const payDate = new Date(invoiceDate);
                    payDate.setDate(payDate.getDate() + Math.floor(Math.random() * 20));

                    await client.query(
                        `INSERT INTO "Payment" (id, "paymentNumber", "paymentMethod", amount, "paymentDate", "invoiceId", "customerId", "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
                        [payNum, methods[payCount % methods.length], total, payDate, invId, custId]
                    );
                    payCount++;
                }
            }
        }
    }

    console.log(`✅ Created ${subCount} subscriptions, ${invCount} invoices, ${payCount} payments`);

    await client.end();
    console.log('\n🎉 [SEED] Database seeded successfully!');
    console.log('\n📋 Demo Credentials:');
    console.log('  Admin:    admin@test.com     / Admin@123');
    console.log('  Staff:    staff@test.com     / Staff@123');
    console.log('  Customer: customer@test.com  / Customer@123');
}

seed().catch(e => {
    console.error('❌ Seed error:', e.message);
    process.exit(1);
});
