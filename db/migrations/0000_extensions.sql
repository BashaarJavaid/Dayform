CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- array_to_string is only STABLE; this IMMUTABLE wrapper lets foods.aliases carry a trigram index.
CREATE OR REPLACE FUNCTION dayform_aliases_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1, ' ') $$;
