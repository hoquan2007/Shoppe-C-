CREATE TABLE IF NOT EXISTS auth_identities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, subject TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(provider,subject), UNIQUE(user_id,provider));
CREATE TABLE IF NOT EXISTS auth_challenges (id TEXT PRIMARY KEY, expires_at BIGINT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS auth_identities_user ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges(expires_at);
