#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  PROJECT_ID, CONTAINER_NAME, assertLocalEnvironment, assertLocalStatus,
  assertDockerEndpoint, assertLocalContainer, parseArguments,
} from "./local.mjs";
import { buildSeedSql } from "./sql.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let phase = "proteções locais";
function command(executable, args, options = {}) {
  return execFileSync(executable, args, {
    cwd: root, encoding: "utf8", timeout: 90000,
    stdio: ["pipe", "pipe", "pipe"], ...options,
  }).trim();
}
try {
  const { userId } = parseArguments(process.argv.slice(2));
  assertLocalEnvironment(process.env, existsSync(join(root, "supabase/.temp/project-ref")));
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
  if (!new RegExp(`^project_id\\s*=\\s*"${PROJECT_ID}"\\s*$`, "m").test(config))
    throw new Error("Seed recusado: project_id diferente do projeto local descartável esperado.");

  phase = "Docker local (instale/inicie Docker Desktop ou Engine)";
  const [context] = JSON.parse(command("docker", ["context", "inspect"]));
  const dockerHost = context?.Endpoints?.docker?.Host;
  assertDockerEndpoint(dockerHost);
  // Pin the validated socket: another operator may change the default context
  // while npx runs. CLI and Docker calls must retain this exact local daemon.
  const localEnv = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !["DOCKER_HOST", "DOCKER_CONTEXT"].includes(key.toUpperCase())));
  localEnv.DOCKER_HOST = dockerHost;
  phase = "Supabase local (execute npx supabase@2.117.0 start)";
  // Same pinned CLI used by the repository integration runners. No environment
  // credentials, dotenv, linked flags, external URLs or keys are consumed.
  const status = JSON.parse(command(process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "supabase@2.117.0", "status", "-o", "json"],
    { shell: process.platform === "win32", env: localEnv }));
  assertLocalStatus(status);
  phase = "container descartável verificado";
  const [container] = JSON.parse(command("docker", ["--host", dockerHost, "inspect", CONTAINER_NAME], { env: localEnv }));
  const containerId = assertLocalContainer(container);

  phase = "transação de dados (em caso de erro, rollback automático)";
  // Use the immutable container ID and its INTERNAL Unix PostgreSQL socket.
  // DB_URL is validated but NEVER connected to: no forwarded loopback port can
  // redirect these writes to a linked/remote database. No password is supplied.
  const output = command("docker", ["--host", dockerHost, "exec", "-i", containerId, "psql", "-X", "-w", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql", "-U", "postgres", "-d", "postgres"],
    { input: buildSeedSql(userId), env: localEnv });
  const report = JSON.parse(output);
  console.log(`DEMONSTRAÇÃO LOCAL — massa ${report.result}. Nenhum dado de produção utilizado.`);
  console.log(`Usuário local: ${report.user_name} (${report.user_id}); use sua senha existente.`);
  for (const unit of report.units) {
    console.log(`\n${unit.code} | ${unit.name} | ${unit.id}`);
    const inspections = (report.inspections ?? []).filter((i) => i.unit_id === unit.id);
    if (!inspections.length) console.log("  Sem auditorias.");
    for (const i of inspections) {
      const score = i.final_score === null ? "em andamento" : `${Number(i.final_score).toFixed(2)}% / ${i.final_classification}`;
      console.log(`  ${i.id} | ${i.applied_on} | ${i.status} | ${i.answered}/${i.total_items} | ${score}`);
    }
  }
  console.log("\nPlanos gerados pelo domínio:");
  for (const p of report.plans ?? [])
    console.log(`  ${p.status}${p.effectiveness ? ` / ${p.effectiveness}` : ""}: ${p.count}`);
  console.log("\nEntre no frontend LOCAL e abra Qualidade → Auditoria. Veja docs/development/AUDIT_DEMO_DATA.md.");
} catch (error) {
  // CLI status may contain keys; never dump subprocess output, command objects,
  // environment, connection strings or stacks. Only domain SQL errors are shown.
  const domainError = phase.startsWith("transação")
    ? /ERROR:\s*([^\r\n]+)/.exec(error.stderr?.toString() ?? "")?.[1]
    : null;
  const detail = error.status === undefined && !error.code ? error.message : domainError;
  console.error(`seed:audit-demo falhou em ${phase}.${detail ? ` ${detail}` : ""}`);
  console.error("Somente Supabase CLI local/descartável; nenhuma alternativa remota será usada.");
  process.exitCode = 1;
}
