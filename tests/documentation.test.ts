import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatIssue, verifyDocs } from "../scripts/verify-docs.mjs";
import { salesCatalogSources } from "./integration/sales-catalog-sources.mjs";

const item = { key: "item-001", number: 1, text: "Critério sintético" };
const checklist = "docs/reference/AUDIT_CHECKLIST_V1.json";
const revisions = "docs/reference/AUDIT_CHECKLIST_V2_REVISIONS.json";
const manifest = "docs/evidence/SHA256SUMS";
const evidence = "docs/evidence/resultado.pdf";
const sha = (source: string) => createHash("sha256").update(source).digest("hex");

let root: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
function write(path: string, content: string) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const rules = {
  index: "docs/HISTORY.md",
  navigation: { "README.md": ["docs/HISTORY.md", "docs/contrato.md"] },
  anchors: { "docs/contrato.md": ["compatibilidade"] },
  files: ["scripts/protegido.sql"],
  manifests: {},
};
const validate = () => verifyDocs(root, { rules });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gaucha-doc05-"));
  git("init", "--quiet");
  git("config", "user.name", "Fixture DOC-05");
  git("config", "user.email", "doc05@example.test");
  git("config", "core.autocrlf", "false");
  git("config", "commit.gpgsign", "false");
  write(".gitignore", "privado/\n");
  write("README.md", "# Entrada\n\n[Índice](docs/HISTORY.md) e [Contrato](docs/contrato.md).\n");
  write("docs/contrato.md", '<a name="compatibilidade"></a>\n\n# D5-A e D5-B (histórico)\n');
  write("docs/HISTORY.md", "# Índice\n\n[Histórico](history/indice.md)\n");
  write("docs/history/indice.md", "# Subíndice\n\n[Registro](entrada.md)\n");
  write("docs/history/entrada.md", "# Memória\n\n[Vigente](../contrato.md#compatibilidade)\n");
  write("scripts/protegido.sql", "-- fixture\n");
  write(checklist, JSON.stringify({
    catalogVersion: "v1",
    sections: [{ key: "section-01", name: "Seção", order: 1, items: [item] }],
  }));
  write(revisions, JSON.stringify({
    catalogVersion: "v2",
    baseVersion: "v1",
    revisions: [{ ...item, section_key: "section-01", text: "Redação da v2" }],
  }));
  for (const doc of new Set(salesCatalogSources.map((source) => source.doc))) {
    write(doc, salesCatalogSources.filter((source) => source.doc === doc).map((source) => source.tag).join("\n"));
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("validação documental", () => {
  it("resolve Markdown GFM, HTML, anexos e revisões históricas sem rede", async () => {
    write("docs/antigo.md", "# Origem\n");
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", "Baseline sintética");
    const old = git("rev-parse", "HEAD");
    rmSync(join(root, "docs/antigo.md"));
    write("docs/privado/fora.md", "[Ignorado](quebrado.md)\n");
    write("docs/arquivo espaço.png", "imagem sintética");
    write("supabase/migrations/001.sql", "-- docs/contrato.md\n");
    write(evidence, "PDF sintético");
    write(manifest, `${sha("PDF sintético")}  resultado.pdf\n`);
    write("docs/portal.html", '<a id="alvo"></a><img srcset="arquivo%20espaço.png 1x, ./arquivo%20espaço.png 2x">');
    write("docs/fontes.md", [
      "# Ação Θ & *Aplicação*!",
      "# Ação Θ & *Aplicação*!",
      "",
      "[Relativo](./contrato.md) [Migration](/supabase/migrations/001.sql)",
      "![Imagem](<arquivo espaço.png>) [HTML](portal.html#alvo)",
      '<a id="explícita"></a>',
      '[Com acento](#a%C3%A7%C3%A3o-%CE%B8--aplica%C3%A7%C3%A3o)',
      '[Duplicado](#ação-θ--aplicação-1) [Explícita](#explícita)',
      '[Referência][contrato]',
      "",
      "[contrato]: contrato.md#compatibilidade",
      "",
      '<https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/contrato.md#compatibilidade>',
      `[Por SHA](https://github.com/The-Vonky/Gaucha-Gestao/blob/${old}/docs/antigo.md#origem)`,
      "[Externo](https://example.invalid/arquivo)",
      "[Outra branch](https://github.com/The-Vonky/Gaucha-Gestao/blob/codex/doc-04/docs/antigo.md)",
      "",
      "```md",
      "[Exemplo](ausente.md)",
      '<img src="ausente.png">',
      "```",
    ].join("\n"));
    const result = await validate();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.stats).toMatchObject({ archived: 2, historical: 1, external: 2, branches: 1, hashes: 1 });
  });

  it("diagnostica destinos ausentes, escapes, capitalização e âncoras com a linha da referência", async () => {
    write("docs/regressoes.md", [
      "# Documento",
      "[Ausente](ausente.md)",
      "[Âncora](contrato.md#ausente)",
      "![Imagem](ausente.png)",
      "[Migration](../supabase/migrations/ausente.sql)",
      "[Case](Contrato.md)",
      "[Escape](%2e%2e/%2e%2e/fora.md)",
      "[Separador](..%5CREADME.md)",
      "[Codificação](abc%ZZ.md)",
      '[HTML](teste.html#ausente)',
      '<a href="https://github.com/The-Vonky/Gaucha-Gestao/blob/main/docs/ausente.md?token=segredo">main</a>',
    ].join("\n"));
    write("docs/teste.html", '<a id="vigente"></a>');
    const { errors } = await validate();
    expect(errors).toHaveLength(10);
    expect(errors.map((issue) => formatIssue(issue, "ERRO"))).toEqual([
      "ERRO [DOC-LINK] docs/regressoes.md:2 → ausente.md — destino inexistente ou tipo de destino incorreto",
      "ERRO [DOC-ANCHOR] docs/regressoes.md:3 → contrato.md#ausente — âncora inexistente",
      expect.stringContaining("docs/regressoes.md:4 → ausente.png"),
      expect.stringContaining("docs/regressoes.md:5 → ../supabase/migrations/ausente.sql"),
      expect.stringContaining("capitalização ou normalização incorreta, use docs/contrato.md"),
      expect.stringContaining("docs/regressoes.md:7 → %2e%2e/%2e%2e/fora.md — caminho inválido ou fora da raiz"),
      expect.stringContaining("docs/regressoes.md:8 → ..%5CREADME.md — caminho inválido"),
      expect.stringContaining("docs/regressoes.md:9 → abc%ZZ.md — codificação de URL inválida"),
      expect.stringContaining("docs/regressoes.md:10 → teste.html#ausente — âncora inexistente"),
      "ERRO [DOC-LINK] docs/regressoes.md:11 → docs/ausente.md — destino inexistente ou tipo de destino incorreto",
    ]);
  });

  it.skipIf(process.platform === "win32")("encontra colisões Unicode, nomes Windows e links simbólicos", async () => {
    for (const name of ["Straße.txt", "STRASSE.txt", "café.txt", "cafe\u0301.txt", "LPT¹.txt", "fim. ", "com:dois.txt"]) {
      write(`docs/${name}`, "sintético");
    }
    symlinkSync(tmpdir(), join(root, "docs/atalho"));
    const { errors } = await validate();
    expect(errors.map(({ code }) => code)).toEqual(Array(6).fill("DOC-PATH"));
    expect(errors.filter(({ reason }) => reason.includes("colisão"))).toHaveLength(2);
    expect(errors.filter(({ reason }) => reason.includes("Windows"))).toHaveLength(3);
    expect(errors).toContainEqual(expect.objectContaining({ target: "docs/atalho", reason: expect.stringContaining("simbólico") }));
  });

  it("detecta rename sem atualizar a referência e aceita a correção correspondente", async () => {
    expect((await validate()).errors).toEqual([]);
    git("add", ".");
    renameSync(join(root, "docs/history/entrada.md"), join(root, "docs/history/novo.md"));
    const invalid = await validate();
    expect(invalid.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DOC-LINK", file: "docs/history/indice.md", line: 3, target: "entrada.md" }),
      expect.objectContaining({ code: "DOC-INDEX", file: "docs/history/novo.md", reason: expect.stringContaining("sem caminho de descoberta") }),
    ]));
    write("docs/history/indice.md", "# Subíndice\n\n[Registro](novo.md)\n");
    write("docs/outro.md", "# Novo sem número fixo\n");
    expect((await validate()).errors).toEqual([]);
  });

  it("distingue destino inválido em revisão presente de SHA indisponível em checkout raso", async () => {
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", "Baseline sintética");
    const revision = git("rev-parse", "HEAD");
    write("docs/shas.md", [
      `[Ausente](https://github.com/The-Vonky/Gaucha-Gestao/blob/${revision}/docs/ausente.md)`,
      `[Âncora inválida](https://github.com/The-Vonky/Gaucha-Gestao/blob/${revision}/docs/contrato.md#inexistente)`,
      "[Indisponível](https://github.com/The-Vonky/Gaucha-Gestao/blob/0123456789abcdef0123456789abcdef01234567/docs/ausente.md)",
      "",
    ].join("\n"));
    const historicRules = { ...rules, historyBaseline: { revision, path: "docs" } };
    const missingIndexLink = await verifyDocs(root, { rules: historicRules });
    expect(missingIndexLink.errors).toContainEqual(expect.objectContaining({
      code: "DOC-CONTRACT", file: "docs/HISTORY.md", target: revision,
    }));
    write("docs/HISTORY.md", `# Índice\n\n[Histórico](history/indice.md)\n\n[Baseline](https://github.com/The-Vonky/Gaucha-Gestao/tree/${revision}/docs)\n`);
    const { errors, warnings } = await verifyDocs(root, { rules: historicRules });
    expect(errors.map(({ code }) => code)).toEqual(["DOC-LINK", "DOC-ANCHOR"]);
    expect(warnings).toEqual([expect.objectContaining({
      code: "DOC-HISTORY", line: 3, reason: "revisão ou árvore indisponível no Git local",
    })]);
  });

  it("protege a navegação, a âncora legada, o script, o catálogo de Vendas e o checklist", async () => {
    write("README.md", "# Entrada\n\n[Índice](docs/HISTORY.md)\n");
    write("docs/contrato.md", "# Contrato sem âncora\n");
    rmSync(join(root, "scripts/protegido.sql"));
    const [{ doc, tag }] = salesCatalogSources;
    write(doc, "Relatório sem a tag do consumidor");
    write(revisions, '{"revisions":[]}');
    write("supabase/migrations/001.sql", "-- Origem: docs/briefs/LEGADO.md.\n");
    const { errors } = await validate();
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DOC-CONTRACT", target: "docs/contrato.md", reason: expect.stringContaining("navegação canônica") }),
      expect.objectContaining({ code: "DOC-CONTRACT", target: "#compatibilidade", reason: expect.stringContaining("compatibilidade") }),
      expect.objectContaining({ code: "DOC-CONTRACT", target: "scripts/protegido.sql", reason: expect.stringContaining("ausente") }),
      expect.objectContaining({ code: "DOC-CONTRACT", file: doc, target: tag, reason: expect.stringContaining("tag obrigatória") }),
      expect.objectContaining({ code: "DOC-CHECKLIST", file: revisions, reason: expect.stringContaining("estrutura") }),
      expect.objectContaining({ code: "DOC-CONTRACT", file: "supabase/migrations/001.sql", target: "docs/briefs/LEGADO.md" }),
    ]));
  });

  it("acusa manifesto adulterado, entrada inválida, hash divergente, ausência e escape", async () => {
    const original = `${sha("original")}  resultado.pdf\n`;
    write(evidence, "alterado");
    write(manifest, [
      original.trimEnd(),
      "não é um checksum",
      `${sha("ausente")}  ausente.pdf`,
      `${sha("fora")}  ../contrato.md`,
      "",
    ].join("\n"));
    const { errors } = await verifyDocs(root, {
      rules: { ...rules, manifests: { [manifest]: sha(original) } },
    });
    expect(errors.map(({ code, reason }) => [code, reason])).toEqual([
      ["DOC-MANIFEST", "manifesto protegido diverge do registro publicado"],
      ["DOC-MANIFEST", "hash SHA-256 divergente"],
      ["DOC-MANIFEST", "entrada SHA-256 malformada"],
      ["DOC-MANIFEST", "artefato ausente"],
      ["DOC-MANIFEST", "caminho inválido, repetido ou fora do diretório do manifesto"],
    ]);
    rmSync(join(root, manifest));
    const missing = await verifyDocs(root, {
      rules: { ...rules, manifests: { [manifest]: sha(original) } },
    });
    expect(missing.errors).toContainEqual(expect.objectContaining({
      code: "DOC-MANIFEST", file: manifest, reason: "manifesto protegido ausente",
    }));
  });

  it("sinaliza a regressão pelo código de saída e pela mensagem do comando", () => {
    const checkout = fileURLToPath(new URL("..", import.meta.url));
    const script = "scripts/verify-docs.mjs";
    cpSync(join(checkout, "scripts/docs"), join(root, "scripts/docs"), { recursive: true });
    cpSync(join(checkout, script), join(root, script));
    cpSync(join(checkout, "tests/integration/sales-catalog-sources.mjs"),
      join(root, "tests/integration/sales-catalog-sources.mjs"));
    symlinkSync(join(checkout, "node_modules"), join(root, "node_modules"), "junction");
    write("docs/avulso.md", "[Quebrado](destino.md)\n");
    try {
      execFileSync(process.execPath, [join(root, script)], { cwd: tmpdir(), encoding: "utf8", stdio: "pipe" });
      expect.fail("O comando deveria falhar");
    } catch (error) {
      expect(error).toMatchObject({
        status: 1,
        stdout: expect.stringContaining("RESULTADO: FAIL"),
        stderr: expect.stringContaining("ERRO [DOC-LINK] docs/avulso.md:1 → destino.md"),
      });
    }
  });

  it("aceita um Mermaid válido e identifica um diagrama sintaticamente inválido", async () => {
    write("docs/diagramas.md", "# Diagramas\n\n```mermaid\nflowchart TD\nA --> B\n```\n\n~~~mermaid\nflowchart TD\nA[\n~~~\n");
    const { errors, stats } = await validate();
    expect(stats.diagrams).toBe(2);
    expect(errors.map((issue) => formatIssue(issue, "ERRO"))).toEqual([
      "ERRO [DOC-MERMAID] docs/diagramas.md:8 → bloco Mermaid — sintaxe ou tipo de diagrama inválido",
    ]);
  });
});
