ALTER TABLE "attachments" ADD COLUMN "enc_iv" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "enc_auth_tag" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "lock_salt" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "lock_verifier" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "lock_iv" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "lock_auth_tag" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "encrypted_blocks" text;