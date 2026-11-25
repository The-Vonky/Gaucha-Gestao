import { posix } from "node:path";
import { foldPath, historicTree } from "./inventory.mjs";
import { html, markdown, parseDocument } from "./documents.mjs";

const repositoryUrl = /^(?:https?:)?\/\/github\.com\/The-Vonky\/Gaucha-Gestao\/(blob|tree|raw)\/([^/?#]+)(?:\/([^?#]*))?(?=[?#]|$)/i;
const rawUrl = /^(?:https?:)?\/\/raw\.githubusercontent\.com\/The-Vonky\/Gaucha-Gestao\/(?:refs\/heads\/)?([^/?#]+)(?:\/([^?#]*))?(?=[?#]|$)/i;
const shaPattern = /^[0-9a-f]{7,40}$/i;

export function resolvePath(base, path) {
  if (/[\\\x00-\x1f]/u.test(path) || /^[a-z]:/i.test(path)) return undefined;
  const absolute = path.startsWith("/");
  const target = posix.normalize(absolute ? path.slice(1) : posix.join(base, path)).replace(/\/$/, "");
  if (target === ".." || target.startsWith("../") || target.startsWith("/")) return undefined;
  return target || ".";
}

function classify(raw) {
  const parts = raw.match(repositoryUrl) ?? raw.match(rawUrl);
  if (parts) {
    const github = parts[0].match(repositoryUrl);
    const [revision, path = ""] = parts.slice(github ? 2 : 1);
    const fragment = raw.slice(parts[0].length).split("#").slice(1).join("#");
    if (revision === "main" || shaPattern.test(revision)) {
      return { path, fragment, revision, kind: github?.[1]?.toLowerCase() ?? "raw" };
    }
    return { branch: true };
  }
  if (!/^[a-z]:[\\/]/i.test(raw) && /^(?:[a-z][\w+.-]*:|\/\/)/i.test(raw)) {
    return { external: true };
  }
  const hash = raw.indexOf("#");
  return {
    path: (hash < 0 ? raw : raw.slice(0, hash)).split("?", 1)[0],
    fragment: hash < 0 ? "" : raw.slice(hash + 1),
  };
}

export function validateLinks({ root, tree, documents, stats, report, warn, rules }) {
  const history = new Map();
  const parsed = new Map([[tree, documents]]);
  const outgoing = new Map();
  let baselineLinked = false;

  function checkFragment(view, target, fragment, kind, file, line, issue) {
    const lineRange = kind === "blob" && fragment.match(/^L([1-9]\d*)(?:-L([1-9]\d*))?$/);
    const anchorFile = view.dirs.has(target) ? posix.join(target, "README.md") : target;
    if (!lineRange && !markdown.test(anchorFile) && !html.test(anchorFile) && !/\.svg$/i.test(anchorFile)) {
      issue("DOC-ANCHOR", "formato de fragmento sem verificação para este tipo de destino");
      return false;
    }
    const cache = parsed.get(view);
    let document = cache.get(anchorFile);
    if (lineRange || !document) {
      if (!view.files.has(anchorFile)) {
        issue("DOC-ANCHOR", "destino sem documento para resolver a âncora");
        return false;
      }
      const content = view.read(anchorFile)?.toString();
      if (content === undefined) {
        warn("DOC-HISTORY", file, line, target, "blob do fragmento indisponível no Git local");
        return false;
      }
      if (lineRange) {
        const [, first, last = first] = lineRange;
        const lines = content.replace(/\r?\n$/, "").split("\n").length;
        if (Number(first) > Number(last) || Number(last) > lines) {
          issue("DOC-ANCHOR", "intervalo de linhas inexistente");
          return false;
        }
        return true;
      }
      document = parseDocument(anchorFile, content);
      cache.set(anchorFile, document);
    }
    if (!document.anchors.has(fragment)) {
      issue("DOC-ANCHOR", "âncora inexistente");
      return false;
    }
    return true;
  }

  // Snapshot da lista, pois a resolução de fragmentos também armazena SVGs no cache.
  for (const [file, { links }] of [...documents]) {
    const destinations = new Set();
    outgoing.set(file, destinations);
    for (const { raw, line, image } of links) {
      const reference = classify(raw.trim());
      if (reference.external || reference.branch) {
        stats.external++;
        if (reference.branch) stats.branches++;
        continue;
      }
      stats.links++;
      if (image) stats.images++;
      const label = reference.path + (reference.fragment ? "#" + reference.fragment : "") || file;
      const issue = (code, reason) => report(code, file, line, label, reason);
      let path;
      let fragment;
      try {
        path = decodeURIComponent(reference.path);
        fragment = decodeURIComponent(reference.fragment);
      } catch {
        issue("DOC-LINK", "codificação de URL inválida");
        continue;
      }
      const { revision, kind } = reference;
      const pinned = Boolean(revision && revision !== "main");
      if (pinned) stats.historical++;
      let target = !path && !revision ? file :
        resolvePath(revision ? "." : posix.dirname(file), path);
      if (target && !revision && path.startsWith("/") && /^apps\/web\/[^/]+\.html$/i.test(file)) {
        const appTarget = resolvePath("apps/web", path.slice(1));
        target = tree.files.has(appTarget) ? appTarget : resolvePath("apps/web/public", path.slice(1));
      }
      if (target === undefined) {
        issue("DOC-LINK", "caminho inválido ou fora da raiz do repositório");
        continue;
      }
      if (pinned && !image && kind === "tree" && file === rules.index &&
          revision === rules.historyBaseline?.revision && target === rules.historyBaseline?.path) {
        baselineLinked = true;
      }
      let view = tree;
      if (pinned) {
        if (!history.has(revision)) {
          const snapshot = historicTree(root, revision);
          history.set(revision, snapshot);
          if (snapshot) parsed.set(snapshot, new Map());
          else warn("DOC-HISTORY", file, line, revision, "revisão ou árvore indisponível no Git local");
        }
        view = history.get(revision);
        if (!view) continue;
      }
      const isFile = view.files.has(target);
      const isDir = view.dirs.has(target);
      if (!(isFile || isDir) || ((kind === "blob" || kind === "raw" || image) && !isFile) ||
          (kind === "tree" && !isDir)) {
        const exact = !pinned && tree.folded.get(foldPath(target));
        issue("DOC-LINK", exact && exact !== target
          ? `capitalização ou normalização incorreta, use ${exact}`
          : "destino inexistente ou tipo de destino incorreto");
        continue;
      }
      if (/^supabase\/migrations\/.*\.sql$/i.test(target)) stats.migrations++;
      if (/(?:^|\/)(?:evidence|results|reference)\//.test(target)) stats.artifacts.add(target);
      if (fragment) {
        stats.anchors++;
        if (!checkFragment(view, target, fragment, kind, file, line, issue)) continue;
      }
      if (!pinned && !image) destinations.add(target);
    }
  }
  if (rules.historyBaseline) {
    stats.contracts++;
    if (!baselineLinked) {
      report("DOC-CONTRACT", rules.index, 1, rules.historyBaseline.revision,
        "vínculo com a árvore anterior à curadoria ausente");
    }
  }
  return outgoing;
}
