import { existsSync } from "node:fs";

// Print readiness only. Never print environment values or connection strings.
const envFile =
  process.argv.find((arg) => arg.startsWith("--env-file="))?.slice(11) ||
  ".env";
if (existsSync(envFile)) process.loadEnvFile(envFile);
const production = process.argv.includes("--production");
const online = process.argv.includes("--online");
const email = process.argv.includes("--email");
let failed = 0;
function check(name, passed, required = true) {
  console.log(
    `${passed ? "OK" : required ? "MISSING/INVALID" : "OPTIONAL"} ${name}`,
  );
  if (!passed && required) failed++;
}
const has = (key) => !!process.env[key]?.trim();
check("Node.js >= 24", Number(process.versions.node.split(".")[0]) >= 24);
if (process.env.DEMO_CATALOG_AUTO_IMPORT === "true")
  check("Bundled demo catalog", existsSync("database/demo-catalog.json"));
for (const file of [
  "Dockerfile.vercel",
  "vercel.json",
  "database/schema.sql",
  "database/migrations/0002_payment_events_index.sql",
])
  check(file, existsSync(file));
if (production) {
  check("APP_ENV=production", process.env.APP_ENV === "production");
  let origin = false,
    database = false;
  try {
    const url = new URL(process.env.APP_URL);
    origin = url.protocol === "https:" && url.origin === process.env.APP_URL;
  } catch {}
  try {
    const url = new URL(process.env.DATABASE_URL);
    database =
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["require", "verify-full"].includes(url.searchParams.get("sslmode"));
  } catch {}
  check("APP_URL: exact HTTPS origin", origin);
  check("DATABASE_URL: PostgreSQL with required TLS", database);
  check("SEED_DEMO=false", process.env.SEED_DEMO === "false");
  check(
    "CRON_SECRET >= 32 characters",
    (process.env.CRON_SECRET?.length || 0) >= 32,
  );
  check(
    "SUPABASE_URL",
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(
      process.env.SUPABASE_URL || "",
    ),
  );
  check("SUPABASE_SERVICE_KEY", has("SUPABASE_SERVICE_KEY"));
  check("SUPABASE_BUCKET", /^[\w-]+$/.test(process.env.SUPABASE_BUCKET || ""));
  if (has("BOOTSTRAP_ADMIN_EMAIL") || has("BOOTSTRAP_ADMIN_PASSWORD")) {
    check(
      "BOOTSTRAP_ADMIN_EMAIL",
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
        process.env.BOOTSTRAP_ADMIN_EMAIL || "",
      ),
    );
    check(
      "BOOTSTRAP_ADMIN_PASSWORD >= 12 characters",
      (process.env.BOOTSTRAP_ADMIN_PASSWORD?.length || 0) >= 12,
    );
  }
}
for (const key of ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"])
  check(key, has(key), online);
for (const key of ["RESEND_API_KEY", "EMAIL_FROM"]) check(key, has(key), email);
console.log(
  failed
    ? `${failed} required checks failed. No credentials were displayed.`
    : "Configuration checks passed; live connectivity is not verified.",
);
process.exitCode = failed ? 1 : 0;
