import { existsSync, writeFileSync } from "node:fs";

if (!existsSync(".env")) throw new Error("Create the ignored .env file first.");
process.loadEnvFile(".env");
const fields = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_BUCKET",
  "PAYOS_CLIENT_ID",
  "PAYOS_API_KEY",
  "PAYOS_CHECKSUM_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
];
const lines = [
  "# PRIVATE: import these server variables into Vercel. Never commit this file.",
  "# Add APP_URL with the exact HTTPS origin issued by Vercel before deployment.",
  "APP_ENV=production",
  "PORT=8080",
  "SEED_DEMO=false",
  "DEMO_CATALOG_AUTO_IMPORT=true",
];
if (/^https:\/\//.test(process.env.APP_URL || ""))
  lines.push(`APP_URL=${process.env.APP_URL}`);
for (const name of fields) {
  const value = process.env[name] || "";
  if (/[\r\n]/.test(value))
    throw new Error(`Multiline configuration is unsupported for ${name}`);
  lines.push(`${name}=${JSON.stringify(value)}`);
}
writeFileSync(".env.vercel", lines.join("\n") + "\n", { mode: 0o600 });
console.log(
  "Saved private .env.vercel; credentials were not displayed. Set APP_URL in Vercel. Bootstrap credentials are excluded.",
);
