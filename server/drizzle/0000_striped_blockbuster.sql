-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"english" text NOT NULL,
	"arabic" text NOT NULL,
	"transliteration" text NOT NULL,
	"category" text NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

*/