// Conecta a um Chromium já aberto pelo mantenedor; não inicia servidor, banco ou fixtures.
import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { attachAuditTraffic, TRAFFIC_STAGES } from "../tests/integration/audit-evidence-traffic.mjs";
const [countArg, output, appArg = "http://127.0.0.1:5173", cdpArg = "http://127.0.0.1:9222"] = process.argv.slice(2);
if (!["10", "30", "100"].includes(countArg) || !output) throw new Error("Uso: node scripts/measure-audit-evidence.mjs 10|30|100 /tmp/relatorio.json [origem-app-local] [CDP-local]");
for (const raw of [appArg, cdpArg]) {
  const url = new URL(raw);
  if (!['127.0.0.1','localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Somente origens locais sem credenciais ou parâmetros.");
}
const browser = await chromium.connectOverCDP(cdpArg);
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith(new URL(appArg).origin + "/"));
if (!page) { await browser.close(); throw new Error("Abra a aplicação local no Chromium de medição antes de iniciar."); }
const meter = await attachAuditTraffic(page, { appOrigin: appArg, storageOrigin: "http://127.0.0.1:54321" });
const input = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.log("Use somente a auditoria sintética. Digite uma etapa ANTES de executar a ação no browser; save encerra.");
  console.log(TRAFFIC_STAGES.join(" | "));
  for (;;) {
    const value = (await input.question("etapa> ")).trim();
    if (value === "save") break;
    if (!TRAFFIC_STAGES.includes(value)) { console.log("Etapa inválida."); continue; }
    meter.stage(value);
  }
  const report = await meter.snapshot();
  await writeFile(output, JSON.stringify({ ...report, revision: execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {encoding:"utf8"}).trim(), images: Number(countArg),
    browser: browser.version(), measuredAt: new Date().toISOString(), device: "Chromium desktop; sem homologação física" }, null, 2) + "\n", {mode:0o600});
  console.log("Relatório sanitizado salvo. Confirme unfinished=0 e registre latência/rede/aparelho no roteiro.");
} finally { input.close(); await meter.close(); await browser.close(); }
