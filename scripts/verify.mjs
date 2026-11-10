#!/usr/bin/env node
// Verificação local equivalente ao job `validate` da CI (.github/workflows/validate.yml),
// mais o build isolado da galeria do Design System. Executa todas as etapas e resume;
// `verify:build` só roda se `build` passou. Sai com código 1 se alguma etapa falhar.
// O build usa os MESMOS valores públicos fictícios da CI: nada é contatado e não há deploy.
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const ciBuildEnv = {
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci-build-placeholder",
};
const steps = [
  ["typecheck", ["run", "typecheck"]],
  ["lint", ["run", "lint"]],
  ["test", ["test"]],
  ["build", ["run", "build"], ciBuildEnv],
  ["verify:build", ["run", "verify:build"]],
  ["ds:build", ["run", "ds:build"]],
  ["audit", ["audit", "--audit-level=moderate"]],
];
const results = [];
const failed = new Set();
for (const [name, args, env] of steps) {
  if (name === "verify:build" && failed.has("build")) {
    results.push("SKIP  verify:build (build falhou)");
    continue;
  }
  const started = Date.now();
  console.log(`\n▶ ${name}: npm ${args.join(" ")}`);
  const run = spawnSync(npm, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (run.status !== 0) failed.add(name);
  results.push(`${run.status === 0 ? "PASS" : "FAIL"}  ${name} (${seconds}s)`);
}
console.log(`\nResumo da verificação\n${results.join("\n")}`);
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
