import dotenv from "dotenv";
dotenv.config();

// Rewrite DATABASE_URL to a _test database so tests never touch prod.
// Replaces the DB name segment in the URL (before any ? or end-of-string).
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('_test')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /(\/[^/?]+)(\?|$)/,
    '$1_test$2',
  );
}