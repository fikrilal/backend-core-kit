-- Backfill: ensure every existing User has a profile row.
--
-- Safe to run multiple times via ON CONFLICT.
INSERT INTO "UserProfile" ("userId", "createdAt", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId") DO NOTHING;

