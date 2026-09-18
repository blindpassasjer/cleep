// One-time backfill: computes `blocks` for every existing note from its legacy content/items/
// isChecklist columns. Additive and idempotent -- rows that already have a non-empty `blocks`
// array are skipped, so running this more than once (or after a partial failure) is safe. Run via
// `npm run db:backfill-blocks` once after deploying the migration that adds the `blocks` column.
import { sql } from 'drizzle-orm';
import { db } from './client.js';
import { notes } from './schema.js';
import { blocksFromLegacy } from '../lib/blocks.js';

const BATCH_SIZE = 500;

async function main() {
  let processed = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(notes)
      .where(sql`${notes.blocks} = '[]'::jsonb`)
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      const blocks = blocksFromLegacy(row);
      await db.update(notes).set({ blocks }).where(sql`${notes.id} = ${row.id}`);
    }
    processed += rows.length;
    console.log(`Backfilled ${processed} note(s)...`);
    if (rows.length < BATCH_SIZE) break;
  }
  console.log(`Done. Backfilled ${processed} note(s) total.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
