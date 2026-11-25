import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const config = {
  startOnLoad: false,
  securityLevel: "strict",
  logLevel: "fatal",
  suppressErrorRendering: true,
  secure: [
    "secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges",
    "suppressErrorRendering", "logLevel", "themeCSS",
  ],
};
const require = createRequire(import.meta.url);

async function parseAll(diagrams, check) {
  // O sanitizador usado por Mermaid espera um DOM. JSDOM aqui não carrega
  // recursos nem executa scripts e recebe apenas o texto dos blocos.
  const dom = new JSDOM();
  const previous = globalThis.window;
  globalThis.window = dom.window;
  try {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize(config);
    for (const diagram of diagrams) await check(diagram, () => mermaid.parse(diagram.source));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
    dom.window.close();
  }
}

async function renderAll(diagrams, check) {
  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    throw new Error("Chromium indisponível. Confira as dependências do host e execute npx playwright install chromium.");
  }
  try {
    const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.addScriptTag({ path: require.resolve("mermaid/dist/mermaid.min.js") });
    await page.evaluate((settings) => {
      const csp = document.createElement("meta");
      csp.httpEquiv = "Content-Security-Policy";
      csp.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
      document.head.append(csp);
      window.mermaid.initialize(settings);
    }, config);
    for (const [index, diagram] of diagrams.entries()) {
      await check(diagram, () => page.evaluate(async ({ index, source }) => {
        const { svg } = await window.mermaid.render("doc" + index, source);
        return /<svg\b/.test(svg);
      }, { index, source: diagram.source }));
    }
  } finally {
    await browser.close();
  }
}

export async function validateDiagrams(diagrams, render, report) {
  if (!diagrams.length) return;
  const run = render ? renderAll : parseAll;
  await run(diagrams, async ({ file, line }, validate) => {
    try {
      if (!await validate()) throw new Error();
    } catch {
      report("DOC-MERMAID", file, line, "bloco Mermaid",
        render ? "falha na renderização SVG" : "sintaxe ou tipo de diagrama inválido");
    }
  });
}
