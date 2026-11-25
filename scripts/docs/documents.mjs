import GithubSlugger from "github-slugger";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { parse, parseFragment } from "parse5";

export const markdown = /\.(?:md|markdown)$/i;
export const html = /\.html?$/i;
export const mermaid = /\.(?:mmd|mermaid)$/i;
const gfmSyntax = gfm();
const gfmNodes = gfmFromMarkdown();

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function headingText(node) {
  if (node.type === "image") return node.alt;
  if (["text", "inlineCode"].includes(node.type)) return node.value;
  return (node.children ?? []).map(headingText).join("");
}

// Segue a separação de candidatos de srcset, preservando vírgulas dentro de URLs
// (por exemplo, data:). Descritores de resolução/densidade não são destinos.
function srcsetUrls(value) {
  return [...value.matchAll(/[^,\s]\S*(?<!,)(?:,+|\s+[^,]*,|\s+[^,]*$|$)/g)]
    .map(([candidate]) => candidate.trim().split(/\s+/, 1)[0].replace(/,+$/, ""));
}

function collectHtml(source, wholeFile, firstLine, anchors, links) {
  const parseHtml = wholeFile ? parse : parseFragment;
  const tree = parseHtml(source, { sourceCodeLocationInfo: true });
  const visit = (node) => {
    for (const { name, value } of node.attrs ?? []) {
      const line = firstLine + (node.sourceCodeLocation?.attrs?.[name]?.startLine ?? 1) - 1;
      if (name === "id" || (node.tagName === "a" && name === "name")) anchors.add(value);
      if (["href", "src", "srcset", "poster"].includes(name) ||
          (node.tagName === "object" && name === "data")) {
        const image = ["img", "source", "image"].includes(node.tagName) || name === "poster";
        const urls = name === "srcset" ? srcsetUrls(value) : [value];
        for (const raw of urls) links.push({ raw, line, image });
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(tree);
}

export function parseDocument(file, source) {
  const links = [];
  const anchors = new Set();
  const diagrams = [];
  const addDiagram = (value, line) => {
    diagrams.push({ file, line, source: value });
    // Apenas os destinos explícitos da sintaxe de links em flowcharts.
    for (const [offset, row] of value.split("\n").entries()) {
      const link = row.match(/^\s*click\s+\S+\s+(?:href\s+)?"([^"]+)"/);
      if (link) links.push({ raw: link[1], line: line + offset + Number(markdown.test(file)) });
    }
  };

  if (html.test(file) || /\.svg$/i.test(file)) {
    collectHtml(source, true, 1, anchors, links);
  } else if (mermaid.test(file)) {
    addDiagram(source, 1);
  } else if (markdown.test(file)) {
    const tree = fromMarkdown(source, { extensions: [gfmSyntax], mdastExtensions: [gfmNodes] });
    const definitions = new Map();
    const slugger = new GithubSlugger();

    walk(tree, (node) => {
      if (node.type === "definition" && !definitions.has(node.identifier)) {
        definitions.set(node.identifier, node);
      }
    });
    walk(tree, (node) => {
      const line = node.position?.start.line ?? 1;
      if (node.type === "heading") anchors.add(slugger.slug(headingText(node)));
      if (node.type === "html") collectHtml(node.value, false, line, anchors, links);
      if (node.type === "code" && node.lang?.toLowerCase() === "mermaid") addDiagram(node.value, line);
      if (node.type === "link" || node.type === "image") {
        links.push({ raw: node.url, line, image: node.type === "image" });
      }
      if (node.type === "linkReference" || node.type === "imageReference") {
        const definition = definitions.get(node.identifier);
        if (definition) links.push({ raw: definition.url, line, image: node.type === "imageReference" });
      }
    });
  }
  return { links, anchors, diagrams };
}
