require('dotenv').config();
const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL;

async function resetDB() {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    console.log('✅ Connected to Neon DB via pg');

    // Drop all tables with CASCADE
    const dropSQL = `
        DO $$ DECLARE r RECORD;
        BEGIN
            FOR r IN (
                SELECT tablename FROM pg_tables WHERE schemaname = 'public'
            ) LOOP
                EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
            END LOOP;
        END $$;
    `;

    await client.query(dropSQL);
    console.log('✅ All tables dropped');
    await client.end();
    console.log('Done! Now run: npx prisma db push');
}

resetDB().catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
