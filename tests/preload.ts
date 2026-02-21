/**
 * Test preload: sets dummy environment variables so modules that check
 * for DATABASE_URL at import-time don't throw during unit tests.
 * No actual DB connection is made in pure function tests.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
