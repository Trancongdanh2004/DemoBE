CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE file_type AS ENUM ('pdf', 'word', 'excel');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year        INTEGER NOT NULL UNIQUE CHECK (year BETWEEN 1990 AND 2100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id     UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year_id, name)
);

CREATE TABLE IF NOT EXISTS files (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id            UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  original_name        VARCHAR(500) NOT NULL,
  file_type            file_type NOT NULL,
  mime_type            VARCHAR(150) NOT NULL,
  size_bytes           BIGINT NOT NULL,
  cloudinary_url       TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  uploader_name        VARCHAR(255) NOT NULL,
  uploader_unit        VARCHAR(255),
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_folder_id    ON files (folder_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at  ON files (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_uploader     ON files (lower(uploader_name));
CREATE INDEX IF NOT EXISTS idx_folders_year_id    ON folders (year_id);

DO $$ BEGIN
  ALTER TABLE years ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE folders ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE files ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION
  WHEN others THEN null;
END $$;

