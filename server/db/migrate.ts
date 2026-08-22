import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required.');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  await pool.end();
  console.log('Migrations applied.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
