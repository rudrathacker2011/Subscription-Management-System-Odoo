require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const client = new PrismaClient();

async function dropAllTables() {
    console.log('🗑️  Dropping all existing tables...');
    try {
        // Drop tables in reverse dependency order
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "InvoiceLineItemTax" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "SubscriptionLineItemTax" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Payment" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "InvoiceLineItem" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Invoice" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "SubscriptionLineItem" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Subscription" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "QuotationTemplateLineItem" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "QuotationTemplate" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "RecurringPlan" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "ProductVariant" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Product" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Discount" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Tax" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "User" CASCADE;`);
        // Old table names
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Variant" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "Plan" CASCADE;`);
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;`);
        console.log('✅ All tables dropped successfully!');
    } catch (err) {
        console.error('Drop error:', err.message);
    } finally {
        await client.$disconnect();
    }
}

dropAllTables();
