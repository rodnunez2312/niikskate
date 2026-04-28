-- YouTube + X (Twitter) follow links (idempotent)
INSERT INTO social_accounts (platform, account_name, account_url, display_order, is_active)
SELECT 'youtube', 'NiikSkate', 'https://www.youtube.com/@NiikSkate', 3, true
WHERE NOT EXISTS (SELECT 1 FROM social_accounts WHERE platform = 'youtube');

INSERT INTO social_accounts (platform, account_name, account_url, display_order, is_active)
SELECT 'tiktok', 'NiikSkate', 'https://www.tiktok.com/@niikskate', 4, true
WHERE NOT EXISTS (SELECT 1 FROM social_accounts WHERE platform = 'tiktok');
