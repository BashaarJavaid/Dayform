-- foods table for T-12 (food search). T-11 folds this into the shared schema in db/.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS foods (
  id text PRIMARY KEY,               -- stable slug: desi "chicken-karahi", USDA "usda-<fdc_id>"
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  nutrients jsonb NOT NULL,          -- per 100 g: kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, iron_mg, calcium_mg, potassium_mg, vitamin_d_mcg
  portions jsonb NOT NULL,           -- portion name -> grams
  default_portion text NOT NULL,
  source text NOT NULL,
  priority int NOT NULL DEFAULT 0
);
-- One row per normalized name or alias; the trigram index on name and aliases (DESIGN §6) lives here.
CREATE TABLE IF NOT EXISTS food_terms (
  food_id text NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  term text NOT NULL
);
CREATE INDEX IF NOT EXISTS food_terms_term_trgm ON food_terms USING gin (term gin_trgm_ops);
CREATE INDEX IF NOT EXISTS food_terms_term ON food_terms (term);
