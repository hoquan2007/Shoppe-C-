import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync(".env.admin.local")) process.loadEnvFile(".env.admin.local");
const values = Object.entries(process.env)
  .filter(
    ([key, value]) =>
      /(?:KEY|SECRET|PASSWORD|DATABASE_URL|TOKEN)$/.test(key) &&
      value.length >= 12,
  )
  .map(([, value]) => value);
// Compare against every local env file without displaying or exporting its values.
for (const file of readdirSync(".").filter((name) =>
  /^\.env(?:\..+)?$/.test(name),
)) {
  const configuration = parseEnv(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(configuration)) {
    if (
      /(?:KEY|SECRET|PASSWORD|DATABASE_URL|TOKEN)$/.test(key) &&
      value.length >= 12
    )
      values.push(value);
    if (key === "DATABASE_URL") {
      try {
        const password = decodeURIComponent(new URL(value).password);
        if (password.length >= 8)
          values.push(password, encodeURIComponent(password));
      } catch {}
    }
  }
}
try {
  const password = decodeURIComponent(
    new URL(process.env.DATABASE_URL).password,
  );
  if (password.length >= 8) values.push(password, encodeURIComponent(password));
} catch {}
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sb_secret_[A-Za-z0-9_]{25,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /GOCSPX-[A-Za-z0-9_-]{20,}/,
];
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8", windowsHide: true },
)
  .split("\0")
  .filter(Boolean);
const findings = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf8");
  if (
    values.some((value) => content.includes(value)) ||
    patterns.some((pattern) => pattern.test(content))
  )
    findings.push(file);
}
if (findings.length) {
  console.error(
    "Possible credentials in Git-visible files (values omitted):\n" +
      [...new Set(findings)].join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    `Checked ${files.length} Git-visible files; no configured credentials or known secret patterns found. Ignored files are excluded.`,
  );
