ALTER TABLE users
ADD COLUMN account_role TEXT NOT NULL DEFAULT 'MEMBER'
    CHECK (account_role IN ('OWNER', 'MEMBER'));

-- This migration is applied to the existing installation before guest accounts
-- are invited. Preserve existing users as platform owners; users created after
-- the migration receive the MEMBER default above.
UPDATE users
SET account_role = 'OWNER';
