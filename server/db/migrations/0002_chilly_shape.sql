ALTER TABLE "notes" ADD COLUMN "is_checklist" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "items" jsonb DEFAULT '[]'::jsonb NOT NULL;