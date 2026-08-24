import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings } from '../db/schema.js';

const SETTINGS_ID = 'singleton';

export async function getRegistrationOpen(): Promise<boolean> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID)).limit(1);
  return rows[0]?.registrationOpen ?? false;
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: SETTINGS_ID, registrationOpen: open })
    .onConflictDoUpdate({ target: appSettings.id, set: { registrationOpen: open } });
}
