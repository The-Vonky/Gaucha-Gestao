import { createHash } from "node:crypto";
import { posix } from "node:path";
import { salesCatalogSources } from "../../tests/integration/sales-catalog-sources.mjs";
import { markdown } from "./documents.mjs";
import { resolvePath } from "./links.mjs";

const checklist = "docs/reference/AUDIT_CHECKLIST_V1.json";
const revisions = "docs/reference/AUDIT_CHECKLIST_V2_REVISIONS.json";
const d5b = "docs/modules/room-booking/D5B_ACCESS.md";
const d5c = "docs/modules/room-booking/D5C_ADMIN_MODES.md";
const masterGuide = "docs/planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md";

export const policy = {
  index: "docs/HISTORY.md",
  historyBaseline: { revision: "1f9dee5dce78e4062d8eba2b666511b047056c13", path: "docs" },
  navigation: {
    "README.md": ["docs/README.md", "AGENTS.md"],
    "CLAUDE.md": ["AGENTS.md", "README.md", "docs/README.md"],
    "docs/README.md": [
      "AGENTS.md", "CLAUDE.md", "docs/HISTORY.md", masterGuide,
      "docs/architecture/IMPLEMENTATION_MAP.md", "docs/planning/PLANO_DIRETOR_2026.md",
      "docs/planning/DECISION_REGISTER.md", "docs/architecture/AUTHORIZATION.md",
      "docs/architecture/SECURITY.md", "docs/operations/LOCAL_DEV_UBUNTU.md",
      "docs/operations/LOCAL_DEV_WINDOWS.md", "docs/operations/DOCKER_LOCAL_STANDARDIZATION.md",
      "docs/decisions", "docs/modules/core/ACCESS_GOVERNANCE_READ_V1.md",
      "docs/modules/audit/OPERATOR_GUIDE_V1.md", "docs/modules/abc/OPERATOR_GUIDE_V1.md",
      "docs/modules/sales/VEN02_OPERATIONS.md", "docs/modules/announcements/ADMINISTRATION_V1.md",
      "docs/modules/feedback/FEEDBACK_V1.md", d5c, "docs/modules/room-booking/ACCEPTANCE_V1.md",
      "docs/modules/audit/QUALITY_ACCEPTANCE_V1.md",
    ],
    [d5b]: ["docs/history/modules/room-booking/D5B_ACCESS.md", d5c],
  },
  anchors: {
    [masterGuide]: ["51-estado-atual-das-15-ggs--23112026"],
  },
  files: ["scripts/ops/room-booking-manager.sql"],
  manifests: {
    "docs/modules/audit/evidence/reporting-export-20261118/SHA256SUMS":
      "a3238edcd793fbe3e9423f6a505b566e6c00a1a97130da97b1acab646f13c35d",
  },
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestName = /^SHA256SUMS(?:\.txt)?$/i;

function validateManifests(tree, protectedManifests, report, stats) {
  for (const [file, digest] of Object.entries(protectedManifests)) {
    stats.contracts++;
    if (!tree.files.has(file)) {
      report("DOC-MANIFEST", file, 1, file, "manifesto protegido ausente");
    } else if (sha256(tree.read(file).toString().replaceAll("\r\n", "\n")) !== digest) {
      report("DOC-MANIFEST", file, 1, file, "manifesto protegido diverge do registro publicado");
    }
  }

  for (const file of tree.files) {
    if (!manifestName.test(posix.basename(file))) continue;
    stats.manifests++;
    const dir = posix.dirname(file);
    const lines = tree.read(file).toString().replace(/\r?\n$/, "").split(/\r?\n/);
    const seen = new Set();
    for (const [offset, line] of lines.entries()) {
      const entry = line.match(/^([0-9a-f]{64}) [ *](\S.*)$/i);
      if (!entry) {
        report("DOC-MANIFEST", file, offset + 1, "", "entrada SHA-256 malformada");
        continue;
      }
      const [, digest, path] = entry;
      const target = resolvePath(dir, path);
      if (!target || target === file || target === dir || path.startsWith("/") ||
          posix.relative(dir, target).startsWith("../") || seen.has(target)) {
        report("DOC-MANIFEST", file, offset + 1, path, "caminho inválido, repetido ou fora do diretório do manifesto");
        continue;
      }
      seen.add(target);
      if (!tree.files.has(target)) {
        report("DOC-MANIFEST", file, offset + 1, path, "artefato ausente");
      } else if (sha256(tree.read(target)) !== digest.toLowerCase()) {
        report("DOC-MANIFEST", file, offset + 1, path, "hash SHA-256 divergente");
      } else {
        stats.artifacts.add(target);
        stats.hashes++;
      }
    }
  }
}

const text = (value) => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const validItem = (item) =>
  text(item?.key) && positiveInteger(item.number) && text(item.text);
const nonEmpty = (value) => Array.isArray(value) && value.length > 0;

function validateChecklist(read, report) {
  const load = (path) => {
    const source = read(path);
    if (source === undefined) return undefined;
    try {
      return { value: JSON.parse(source) };
    } catch {
      report("DOC-CHECKLIST", path, 1, path, "JSON inválido");
      return undefined;
    }
  };
  const catalog = load(checklist);
  const changes = load(revisions);
  const validateCatalog = (value) => text(value?.catalogVersion) && nonEmpty(value.sections) &&
    value.sections.every((section) => text(section?.key) && positiveInteger(section.order) &&
      text(section.name) && nonEmpty(section.items) && section.items.every(validItem));
  const validateRevisions = (value) => text(value?.catalogVersion) && text(value.baseVersion) &&
    value.catalogVersion !== value.baseVersion && nonEmpty(value.revisions) &&
    value.revisions.every((item) => validItem(item) && text(item.section_key));

  const catalogValid = catalog && validateCatalog(catalog.value);
  if (catalog && !catalogValid) report("DOC-CHECKLIST", checklist, 1, checklist, "estrutura do catálogo inválida");
  if (!changes) return;
  if (!validateRevisions(changes.value)) {
    report("DOC-CHECKLIST", revisions, 1, revisions, "estrutura das revisões inválida");
  } else if (catalogValid) {
    const { baseVersion, revisions: items } = changes.value;
    const sections = new Map(catalog.value.sections.map((section) => [section.key, section.items]));
    if (baseVersion !== catalog.value.catalogVersion || !items.every((item) =>
      sections.get(item.section_key)?.some((base) => base.key === item.key && base.number === item.number)
    )) {
      report("DOC-CHECKLIST", revisions, 1, checklist, "revisões incompatíveis com a versão base");
    }
  }
}

export function validateContracts({ tree, documents, outgoing, stats, report, rules }) {
  function requireFile(file, origin = file, line = 1) {
    stats.contracts++;
    if (tree.files.has(file)) return true;
    report("DOC-CONTRACT", origin, line, file, "arquivo exigido pelo contrato ausente");
    return false;
  }

  for (const file of rules.files) requireFile(file);
  for (const [file, targets] of Object.entries(rules.navigation)) {
    if (!requireFile(file)) continue;
    for (const target of targets) {
      stats.contracts++;
      if (!outgoing.get(file)?.has(target)) {
        report("DOC-CONTRACT", file, 1, target, "vínculo de navegação canônica ausente");
      }
    }
  }

  for (const [file, anchors] of Object.entries(rules.anchors)) {
    for (const anchor of anchors) {
      stats.contracts++;
      if (!documents.get(file)?.anchors.has(anchor)) {
        report("DOC-CONTRACT", file, 1, "#" + anchor, "âncora de compatibilidade ausente");
      }
    }
  }

  if (requireFile(rules.index)) {
    const archived = (file) => file.startsWith("docs/history/") && markdown.test(file);
    const discovered = new Set([rules.index]);
    for (const file of discovered) {
      for (const target of outgoing.get(file) ?? []) {
        const page = tree.dirs.has(target) ? posix.join(target, "README.md") : target;
        if (archived(page) && documents.has(page)) discovered.add(page);
      }
    }
    for (const file of documents.keys()) {
      if (!archived(file)) continue;
      stats.archived++;
      if (!discovered.has(file)) {
        report("DOC-INDEX", file, 1, rules.index, "documento histórico sem caminho de descoberta pelo índice");
      }
    }
  }

  const contents = new Map();
  const read = (path, consumer) => {
    if (!contents.has(path)) {
      contents.set(path, requireFile(path, consumer) ? tree.read(path).toString() : undefined);
    }
    return contents.get(path);
  };
  for (const { doc, tag } of salesCatalogSources) {
    const source = read(doc, "tests/integration/sales-catalog-local.mjs");
    stats.contracts++;
    if (source !== undefined && !source.includes(tag)) {
      report("DOC-CONTRACT", doc, 1, tag, "tag obrigatória do catálogo de Vendas ausente");
    }
  }
  validateChecklist(read, report);
  for (const file of tree.files) {
    if (!/^supabase\/migrations\/.*\.sql$/.test(file)) continue;
    for (const [offset, line] of tree.read(file).toString().split("\n").entries()) {
      if (!/^\s*--/.test(line)) continue;
      for (const [path] of line.matchAll(/\bdocs\/(?:[\w.-]+\/)+[\w.-]+\.(?:md|json)\b/g)) {
        requireFile(path, file, offset + 1);
      }
    }
  }
  validateManifests(tree, rules.manifests, report, stats);
}
