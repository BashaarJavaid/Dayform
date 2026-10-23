ALTER TABLE "catalog_items" ALTER COLUMN "asin" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "pack_unit" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "grams_per_pack" real;