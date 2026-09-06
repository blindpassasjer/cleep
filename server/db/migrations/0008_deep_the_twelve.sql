CREATE TABLE IF NOT EXISTS "link_previews" (
	"url" text PRIMARY KEY NOT NULL,
	"title" text,
	"image_url" text,
	"site_name" text,
	"favicon_url" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
