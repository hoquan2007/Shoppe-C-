import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
const prepare = process.argv.includes("--prepare-storage");
const upload = process.argv.includes("--test-upload");
let failures = 0;
const report = (service, state, detail) => {
  if (state === "FAIL") failures++;
  console.log(JSON.stringify({ service, state, detail }));
};
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}
const storageUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_KEY;
const bucket = process.env.SUPABASE_BUCKET || "product-images";
if (storageUrl && key) {
  try {
    const headers = { apikey: key };
    if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
    let response = await request(
      `${storageUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
      { headers },
    );
    let info = await response.json().catch(() => ({}));
    const notFound = response.status === 404 || Number(info.statusCode) === 404;
    if (notFound && prepare) {
      response = await request(`${storageUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bucket,
          name: bucket,
          public: true,
          file_size_limit: 2097152,
          allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
        }),
      });
      if (!response.ok) throw new Error("bucket_create_failed");
      response = await request(
        `${storageUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
        { headers },
      );
      info = await response.json();
    }
    if (!response.ok) {
      report(
        "supabase_storage",
        "FAIL",
        `HTTP ${response.status}; check key or create bucket`,
      );
    } else if (!info.public) {
      report(
        "supabase_storage",
        "FAIL",
        "Bucket is private; unchanged to protect existing objects",
      );
    } else {
      report(
        "supabase_storage",
        "OK",
        "Backend key and public product bucket accepted",
      );
      if (upload) {
        const object = `setup-check/${randomUUID()}.png`;
        const pixel = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMxkAAAAASUVORK5CYII=",
          "base64",
        );
        let created = false;
        try {
          const put = await request(
            `${storageUrl}/storage/v1/object/${bucket}/${object}`,
            {
              method: "POST",
              headers: {
                ...headers,
                "Content-Type": "image/png",
                "x-upsert": "false",
              },
              body: pixel,
            },
          );
          if (!put.ok) throw new Error("upload_failed");
          created = true;
          const read = await request(
            `${storageUrl}/storage/v1/object/public/${bucket}/${object}`,
          );
          if (!read.ok || !Buffer.from(await read.arrayBuffer()).equals(pixel))
            throw new Error("public_read_failed");
          report(
            "supabase_upload",
            "OK",
            "Test PNG uploaded and public bytes verified",
          );
        } finally {
          if (created) {
            const remove = await request(
              `${storageUrl}/storage/v1/object/${bucket}`,
              {
                method: "DELETE",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({ prefixes: [object] }),
              },
            );
            report(
              "supabase_upload_cleanup",
              remove.ok ? "OK" : "FAIL",
              remove.ok ? "Test object removed" : "Test object cleanup failed",
            );
          }
        }
      }
    }
  } catch {
    report(
      "supabase_storage",
      "FAIL",
      "Storage connection or upload check failed; no credentials displayed",
    );
  }
} else
  report("supabase_storage", "FAIL", "Required environment variables missing");

if (process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY) {
  try {
    // Read-only query for a random nonexistent order. Never create a payment here.
    const code = Date.now() * 1000 + Math.floor(Math.random() * 999);
    const response = await request(
      `https://api-merchant.payos.vn/v2/payment-requests/${code}`,
      {
        headers: {
          "x-client-id": process.env.PAYOS_CLIENT_ID,
          "x-api-key": process.env.PAYOS_API_KEY,
        },
      },
    );
    const data = await response.json().catch(() => ({}));
    const providerCode = /^[A-Za-z0-9_-]{1,30}$/.test(String(data.code))
      ? String(data.code)
      : "unknown";
    report(
      "payos_credentials",
      response.status === 200 &&
        providerCode === "101" &&
        /không tồn tại|not found/i.test(data.desc || "")
        ? "OK"
        : response.status === 401 || response.status === 403
          ? "FAIL"
          : "INFO",
      `Read-only query HTTP ${response.status}, provider code ${providerCode}; no payment created`,
    );
    report(
      "payos_checksum",
      /^[a-f0-9]{64}$/i.test(process.env.PAYOS_CHECKSUM_KEY || "")
        ? "INFO"
        : "FAIL",
      "Format check only; provider signature verification still needs a real payment-link response",
    );
  } catch {
    report(
      "payos_credentials",
      "FAIL",
      "Cannot reach payOS; no credentials displayed",
    );
  }
} else
  report("payos_credentials", "FAIL", "Required environment variables missing");

if (process.env.DATABASE_URL) {
  try {
    const uri = new URL(process.env.DATABASE_URL);
    const localBin = path.resolve(".cache/pgdeps/ucrt64/bin");
    const executable =
      process.env.PSQL_PATH ||
      (process.platform === "win32" &&
      existsSync(path.join(localBin, "psql.exe"))
        ? path.join(localBin, "psql.exe")
        : "psql");
    const connection = `host=${uri.hostname} port=${uri.port || 5432} dbname=${decodeURIComponent(uri.pathname.slice(1))} user=${decodeURIComponent(uri.username)} sslmode=${uri.searchParams.get("sslmode") || "require"} connect_timeout=10`;
    const result = spawnSync(
      executable,
      [
        "--no-password",
        "--dbname",
        connection,
        "--tuples-only",
        "--no-align",
        "--command",
        "SELECT json_build_object('connected',true,'schema_present',to_regnamespace('shoppe') IS NOT NULL,'tls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()))",
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: decodeURIComponent(uri.password),
          PATH: `${localBin}${path.delimiter}${process.env.PATH || ""}`,
        },
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      },
    );
    if (result.status === 0) {
      const data = JSON.parse(result.stdout.trim());
      report(
        "postgresql",
        data.tls ? "OK" : "FAIL",
        `Connected; TLS=${!!data.tls}; application schema=${!!data.schema_present}`,
      );
    } else {
      const error = result.stderr || "";
      const reason = /password authentication failed/i.test(error)
        ? "Database password rejected"
        : /network is unreachable|unreachable host|No route to host/i.test(
              error,
            )
          ? "Network route unavailable; use the exact Supabase pooler URI"
          : /could not translate host/i.test(error)
            ? "Database DNS resolution failed"
            : /timeout expired|timed out/i.test(error)
              ? "Database connection timed out; check IPv6 or pooler"
              : "Connection failed or psql unavailable";
      report("postgresql", "FAIL", reason);
    }
  } catch {
    report(
      "postgresql",
      "FAIL",
      "Invalid URI or failed connection; values omitted",
    );
  }
} else report("postgresql", "FAIL", "DATABASE_URL missing");
process.exitCode = failures ? 1 : 0;
