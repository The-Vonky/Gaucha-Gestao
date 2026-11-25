import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { policy, validateContracts } from "./docs/contracts.mjs";
import { validateDiagrams } from "./docs/diagrams.mjs";
import { html, markdown, mermaid, parseDocument } from "./docs/documents.mjs";
import { git, workTree } from "./docs/inventory.mjs";
import { validateLinks } from "./docs/links.mjs";

export async function verifyDocs(root, { render = false, rules = policy } = {}) {
  const errors = [];
  const warnings = [];
  const collect = (list) => (code, file, line, target, reason) =>
    list.push({ code, file, line, target, reason });
  const report = collect(errors);
  const warn = collect(warnings);
  const tree = workTree(root, report);
  const documents = new Map();
  const diagrams = [];
  const stats = {
    files: tree.files.size, documents: 0, archived: 0, links: 0, anchors: 0, images: 0,
    artifacts: new Set(), migrations: 0, historical: 0, external: 0, branches: 0,
    diagrams: 0, manifests: 0, hashes: 0, contracts: 0,
  };

  for (const file of tree.files) {
    if (!markdown.test(file) && !html.test(file) && !mermaid.test(file)) continue;
    const document = parseDocument(file, tree.read(file).toString());
    documents.set(file, document);
    diagrams.push(...document.diagrams);
  }
  stats.documents = documents.size;
  stats.diagrams = diagrams.length;
  const outgoing = validateLinks({ root, tree, documents, stats, report, warn, rules });
  validateContracts({ tree, documents, outgoing, stats, report, rules });
  await validateDiagrams(diagrams, render, report);
  return { errors, warnings, stats: { ...stats, artifacts: stats.artifacts.size } };
}

export function formatIssue({ code, file, line, target, reason }, level) {
  const safe = (value) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, "")
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/gi, "$1[parâmetros omitidos]")
    .replace(/eyJ[A-Za-z\d_-]+\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+/g, "[JWT omitido]");
  const detail = target ? ` → ${safe(target)}` : "";
  return `${level} [${code}] ${safe(file)}:${line}${detail} — ${safe(reason)}`;
}

async function main() {
  const started = performance.now();
  const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
  const root = git(scriptDirectory, ["rev-parse", "--show-toplevel"]).trimEnd();
  const args = process.argv.slice(2);
  const render = args[0] === "--render";
  if (args.length !== Number(render)) throw new Error("Uso: npm run verify:docs ou npm run verify:docs:diagrams.");
  console.log("Validação documental — Gaúcha Gestão");
  const { errors, warnings, stats } = await verifyDocs(root, { render });
  for (const issue of errors) console.error(formatIssue(issue, "ERRO"));
  for (const issue of warnings) console.warn(formatIssue(issue, "AVISO"));
  console.log(`Arquivos no inventário: ${stats.files} | Documentos analisados: ${stats.documents} | Históricos: ${stats.archived}`);
  console.log(`Links internos: ${stats.links} | Âncoras: ${stats.anchors} | Imagens internas: ${stats.images} | Links para migrations: ${stats.migrations}`);
  console.log(`Artefatos referenciados: ${stats.artifacts} | Manifestos: ${stats.manifests} | Hashes conferidos: ${stats.hashes}`);
  console.log(`Referências fixadas por SHA: ${stats.historical} | URLs sem consulta: ${stats.external} (${stats.branches} para outras refs GitHub)`);
  console.log(`Contratos e referências protegidos: ${stats.contracts} | Diagramas (${render ? "SVG" : "sintaxe"}): ${stats.diagrams}`);
  console.log(`Erros: ${errors.length} | Avisos: ${warnings.length} | Tempo: ${((performance.now() - started) / 1000).toFixed(2)} s`);
  console.log(`RESULTADO: ${errors.length ? "FAIL" : "PASS"}`);
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Erros inesperados de dependências ou de I/O podem conter detalhes locais.
    const messages = new Set([
      "Git indisponível ou falha ao consultar a árvore do repositório.",
      "Chromium indisponível. Confira as dependências do host e execute npx playwright install chromium.",
      "Uso: npm run verify:docs ou npm run verify:docs:diagrams.",
    ]);
    console.error(`ERRO [DOC-EXEC] ${messages.has(error.message) ? error.message : "falha ao executar o validador. Confira o checkout e a instalação npm ci."}`);
    console.error("RESULTADO: FAIL");
    process.exitCode = 1;
  });
}
