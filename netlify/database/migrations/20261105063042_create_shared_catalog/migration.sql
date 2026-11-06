CREATE TABLE "catalog_edits" (
	"id" integer PRIMARY KEY,
	"product" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_state" (
	"id" integer PRIMARY KEY,
	"revision" integer DEFAULT 0 NOT NULL
);
