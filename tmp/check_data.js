const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const discounts = await prisma.discount.findMany();
  const taxes = await prisma.tax.findMany();
  
  console.log('--- DISCOUNTS ---');
  console.log(JSON.stringify(discounts, null, 2));
  console.log('\n--- TAXES ---');
  console.log(JSON.stringify(taxes, null, 2));

  if (discounts.length === 0) {
    console.log('\nCreating temporary discount WELCOME10...');
    await prisma.discount.create({
      data: {
        code: 'WELCOME10',
        name: 'Welcome Discount',
        discountType: 'PERCENTAGE',
        value: 10,
        isActive: true,
        limitUsage: 100
      }
    });
  }

  if (taxes.length === 0) {
    console.log('Creating temporary tax VAT (15%)...');
    await prisma.tax.create({
      data: {
        name: 'VAT',
        taxType: 'VAT',
        percentage: 15,
        isActive: true
      }
    });
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
