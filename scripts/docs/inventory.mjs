import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { caseFold } from "unicode-case-folding";

export const foldPath = (path) => caseFold(path.normalize("NFC")).normalize("NFC");

export function git(root, args, optional = false) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    if (!optional) throw new Error("Git indisponível ou falha ao consultar a árvore do repositório.");
    return undefined;
  }
}

function inScope(path) {
  const parts = path.split("/");
  return !parts.some((part) =>
    /^(?:\.git|node_modules|dist|build|coverage|\.cache|tmp|temp|\.branches|\.temp)$/i.test(part) ||
    (/^\.env(?:\.|$)/i.test(part) && part !== ".env.example") ||
    /\.(?:pem|key|pfx|p12|db|sqlite3?|dump|bak|backup|sql\.gz)$/i.test(part)
  );
}

function createTree(paths, read) {
  const files = new Set(paths);
  const dirs = new Set(["."]);
  for (const file of files) {
    for (let dir = posix.dirname(file); !dirs.has(dir); dir = posix.dirname(dir)) dirs.add(dir);
  }
  return { files, dirs, read };
}

export function workTree(root, report) {
  const listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const names = [...new Set(listed.split("\0").filter((path) => path && inScope(path)))].sort();
  const present = [];
  const disk = new Map();
  const folded = new Map();
  const seen = new Set();
  const entries = (dir) => {
    if (!disk.has(dir)) {
      disk.set(dir, new Map(readdirSync(join(root, dir), { withFileTypes: true })
        .map((entry) => [entry.name, entry])));
    }
    return disk.get(dir);
  };

  for (const file of names) {
    let dir = ".";
    const parts = file.split("/");
    for (const [index, part] of parts.entries()) {
      const path = posix.join(dir, part);
      if (!seen.has(path)) {
        seen.add(path);
        const key = foldPath(path);
        const previous = folded.get(key);
        if (previous !== undefined) {
          report("DOC-PATH", path, 1, previous, "colisão por capitalização ou normalização Unicode");
        }
        folded.set(key, path);
        if (/[<>:"\\|?*\p{Cc}]|[. ]$/u.test(part) ||
            /^(?:con|prn|aux|nul|(?:com|lpt)[1-9¹²³]) *(?:\.|$)/i.test(part)) {
          report("DOC-PATH", path, 1, path, "nome incompatível com Windows");
        }
      }
      const entry = entries(dir).get(part);
      if (!entry) break; // Arquivos removidos do checkout deixam de ser destinos válidos.
      if (entry.isSymbolicLink()) {
        report("DOC-PATH", file, 1, path, "link simbólico fora do inventário de arquivos regulares");
        break;
      }
      if (index === parts.length - 1 && entry.isFile()) present.push(file);
      if (!entry.isDirectory()) break;
      dir = path;
    }
  }
  return {
    ...createTree(present, (path) => readFileSync(join(root, path))),
    folded: new Map([...folded].filter(([, path]) => {
      const entry = disk.get(posix.dirname(path))?.get(posix.basename(path));
      return entry?.isFile() || entry?.isDirectory();
    })),
  };
}

export function historicTree(root, sha) {
  const commit = git(root, ["rev-parse", "--verify", sha + "^{commit}"], true)?.trim();
  if (!commit) return undefined;
  const raw = git(root, ["ls-tree", "-rz", commit], true);
  if (raw === undefined) return undefined;
  const files = raw.split("\0").flatMap((entry) => {
    const tab = entry.indexOf("\t");
    const path = entry.slice(tab + 1);
    return /^100[67][0-7]{2} blob /.test(entry) && inScope(path) ? [path] : [];
  });
  return createTree(files, (path) => git(root, ["show", `${commit}:${path}`], true));
}
