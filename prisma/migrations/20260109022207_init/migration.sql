-- Baseline DB setup.
-- We use gen_random_uuid() for UUID defaults; it requires pgcrypto.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
