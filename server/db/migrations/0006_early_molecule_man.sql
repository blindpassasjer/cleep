CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"registration_open" boolean DEFAULT false NOT NULL
);
