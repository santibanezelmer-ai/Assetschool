-- ==============================================================================
-- ASSETSCHOOL MIGRATION 003: Authentication & Security Enhancement
-- Enforces mandatory initial password change and token refresh mechanism
-- ==============================================================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_must_change_pwd ON users(must_change_password);

-- Update seed users to require password change upon first login
UPDATE users 
SET must_change_password = true 
WHERE email IN ('admin@assetschool.lan', 'profesor@assetschool.lan');
