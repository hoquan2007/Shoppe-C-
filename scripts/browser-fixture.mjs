import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
const root = process.cwd();
await mkdir(".cache", { recursive: true });
await mkdir("artifacts", { recursive: true });
const directory = await mkdtemp(path.join(root, ".cache", "browser-test-"));
const base = "http://127.0.0.1:18147";
const binary =
  process.env.SHOPPE_TEST_BINARY ||
  path.join(
    root,
    "build",
    process.platform === "win32" ? "shoppe.exe" : "shoppe",
  );
const env = {
  ...process.env,
  APP_ENV: "test",
  APP_URL: base,
  PORT: "18147",
  DATABASE_URL: "",
  SQLITE_PATH: path.join(directory, "fixture.db"),
  SCHEMA_PATH: path.join(root, "database/schema.sql"),
  STATIC_DIR: path.join(root, "dist"),
  SEED_DEMO: "true",
  DEMO_CATALOG_AUTO_IMPORT: "false",
  DEMO_PASSWORD: "BrowserFixture123!",
  BOOTSTRAP_ADMIN_EMAIL: "",
  BOOTSTRAP_ADMIN_PASSWORD: "",
  PAYOS_CLIENT_ID: "",
  PAYOS_API_KEY: "",
  PAYOS_CHECKSUM_KEY: "",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_KEY: "",
  GOOGLE_CLIENT_ID: "",
  PATH:
    "C:\\msys64\\ucrt64\\bin;" + (process.env.PATH || process.env.Path || ""),
};
const log = await open("artifacts/browser-fixture.log", "w");
const initializer = spawn(binary, ["--initialize"], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ["ignore", log.fd, log.fd],
});
const initialized = await new Promise((resolve, reject) => {
  initializer.on("error", reject);
  initializer.on("exit", resolve);
});
if (initialized !== 0)
  throw new Error(
    "Browser fixture initialization failed; see artifacts/browser-fixture.log",
  );
const db = new DatabaseSync(env.SQLITE_PATH);
const insert = db.prepare(
  "INSERT INTO users(id,email,role,payload) VALUES(?,?,?,?)",
);
db.exec("BEGIN");
for (let n = 0; n < 1000; n++) {
  const user = {
    id: "browser-user-" + n,
    email: "browser-" + n + "@example.invalid",
    name: "Browser fixture " + n,
    role: "buyer",
    active: false,
    created_at: 1793000000 + n,
  };
  insert.run(user.id, user.email, user.role, JSON.stringify(user));
}
db.exec("COMMIT");
db.close();
const server = spawn(binary, [], {
  cwd: root,
  env: { ...env, APP_INITIALIZE: "false" },
  windowsHide: true,
  stdio: ["ignore", log.fd, log.fd],
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.kill());
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
console.log("Isolated browser fixture: " + base);
