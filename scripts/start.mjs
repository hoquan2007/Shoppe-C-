import { spawn } from "node:child_process";
import path from "node:path";
const binary = path.resolve(
  "build",
  process.platform === "win32" ? "shoppe.exe" : "shoppe",
);
const env = { ...process.env };
if (process.platform === "win32")
  env.PATH = `C:\\msys64\\ucrt64\\bin;${env.PATH || env.Path || ""}`;
const server = spawn(binary, [], { stdio: "inherit", env, windowsHide: true });
server.on("error", (error) => {
  console.error("Build backend first:", error.message);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
