-- Avatar Engine migration: add avatarUrl to Character
-- This is the only column we actually need to add. The Story table fields
-- (genre, scenario, characterIds) already exist in the database from a
-- prior migration, so we skip touching that table here.

ALTER TABLE "Character" ADD COLUMN "avatarUrl" TEXT;
