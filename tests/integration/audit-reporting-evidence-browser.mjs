// Browser real, fontes sintéticas e transporte privado simulado; não grava no banco/Storage.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
const origin = process.env.REPORT_LAB_ORIGIN ?? "http://127.0.0.1:5173";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const out = resolve("tmp/audit-report-export-20261118");
await mkdir(out, { recursive: true });
const harness = resolve(out, "lab.tsx");
await writeFile(harness, `import React from 'react';
import {createRoot} from 'react-dom/client';
import {PrintSurface} from '../../apps/web/src/modules/audit/reporting/PrintSurface';
import {prepareEvidence} from '../../apps/web/src/modules/audit/reporting/evidence';
import {workbookBlob} from '../../apps/web/src/modules/audit/reporting/workbook';
import {report} from '../../tests/fixtures/audit-report';
import {privateImages} from '../../apps/web/src/shared/privateImageCache';
privateImages.setAccess('synthetic-report-lab');
const root=createRoot(document.getElementById('root'));
window.runReport=async(version)=>{
 const r={...report,inspection:{...report.inspection,template_version:version}};
 window.progress=[]; const start=performance.now(); window.ticks=0; window.maxStallMs=0; let last=start;
 const interval=setInterval(()=>{const now=performance.now(); window.maxStallMs=Math.max(window.maxStallMs,now-last);last=now;window.ticks++},10);
 try{
 const evidence=await prepareEvidence(r,new AbortController().signal,t=>window.progress.push(t));
 window.prepared=evidence;
 const blob=await workbookBlob(r,evidence);window.workbook=Array.from(new Uint8Array(await blob.arrayBuffer()));
 root.render(<PrintSurface report={r} evidence={evidence} onClose={()=>root.render(null)}/>);
 window.preparationMs=Math.round(performance.now()-start);
 }finally{clearInterval(interval)}
}; window.labReady=true;`);
const svg = `<svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="1600" height="1000" fill="#dcece4"/><path d="M0 700L1600 300V1000H0Z" fill="#356d57"/><rect x="140" y="160" width="1320" height="180" fill="white"/><text x="200" y="275" font-family="sans-serif" font-size="70">EVIDÊNCIA SINTÉTICA</text><text x="200" y="470" font-family="sans-serif" font-size="48">Gaúcha Gestão · Relatório de auditoria</text><text x="200" y="820" fill="white" font-family="sans-serif" font-size="44">Amostra para homologação · sem dados reais</text></svg>`;
const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
const png = await sharp(Buffer.from(svg)).rotate(90).png().toBuffer();
const largePng = await sharp(Buffer.from(svg)).resize(2000, 1200).png({ compressionLevel: 0 }).toBuffer();
const transformedPng = await sharp(largePng).resize({ width: 1280, height: 1280, fit: "inside" }).png().toBuffer();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const version of ["checklist-geral-2026-09-22-v1", "checklist-geral-2026-11-13-v2"]) for (const count of [0, 1, 5, 100]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    page.on("pageerror", error => console.error("Erro do harness:", error.message));
    let mode = "ok", requests = 0, transformRequests = 0;
    const rows = Array.from({ length: count }, (_, i) => ({ id: `synthetic-evidence-${i}`, inspection_id: "00000000-0000-0000-0000-000000000002",
      item_key: `i${count === 5 ? [0, 0, 10, 11, 11][i] : Math.floor(i / 5)}`, object_key: `synthetic/${i}.${i % 2 ? "png" : "jpg"}`,
      original_name: `foto-sintética-${i + 1}.${i % 2 ? "png" : "jpg"}`, content_type: i % 2 ? "image/png" : "image/jpeg",
      size_bytes: i === 3 ? largePng.length : i % 2 ? png.length : jpeg.length,
      created_by: "synthetic-user", uploaded_by_name: "Pessoa sintética", uploaded_at: "2026-11-18T12:00:00Z" }));
    // O driver intercepta somente os endpoints exatos usados no ensaio.
    await page.route("**/rest/v1/rpc/checklist_evidence", route => route.fulfill({ json: rows }));
    await page.route("**/storage/v1/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "POST") {
        const transform = !!request.postDataJSON()?.transform;
        if (transform) transformRequests++;
        const path = url.pathname.replace("/storage/v1/object/sign/", transform ? "/render/image/sign/" : "/object/sign/");
        return route.fulfill({ json: { signedURL: `${path}?token=synthetic-lab-only` } });
      }
      requests++;
      assert.equal(await request.headerValue("cache-control") === "public", false);
      if (mode === "denied" || mode === "expired") return route.fulfill({ status: mode === "denied" ? 403 : 401, body: "" });
      if (mode === "interrupted") return route.abort("connectionfailed");
      const index = Number(/synthetic\/(\d+)/.exec(url.pathname)?.[1]);
      const transformed = url.pathname.includes("/render/image/");
      const body = index === 3 ? transformed ? transformedPng : largePng : index % 2 ? png : jpeg;
      return route.fulfill({ body, contentType: index % 2 ? "image/png" : "image/jpeg" });
    });
    await page.route(`${origin}/__report-evidence-lab`, route => route.fulfill({ contentType: "text/html", body: `<html><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@fs${harness}"></script></body></html>` }));
    await page.goto(`${origin}/__report-evidence-lab`);
    await page.waitForFunction(() => window.labReady);
    await page.evaluate(version => window.runReport(version), version);
    const print = page.getByRole("button", { name: "Imprimir / Salvar como PDF" });
    await print.waitFor();
    await page.waitForFunction(() => document.querySelector(".report-overlay")?.dataset.ready === "true");
    assert.equal(await page.locator("figure").count(), count);
    assert.equal(await page.locator("figure img").count(), count);
    const bytes = Buffer.from(await page.evaluate(() => window.workbook));
    const label = `${version.endsWith("v1") ? "v1" : "v2"}-${count}`;
    await writeFile(resolve(out, `auditoria-${label}.xlsx`), bytes);
    const entries = unzipSync(bytes);
    assert.equal(Object.keys(entries).filter(name => name.startsWith("xl/media/")).length, count);
    const parsed = await readExcelFile(bytes);
    assert.deepEqual(parsed.map(s => s.sheet), ["Resumo", "Checklist", "Secoes", "Evidências"]);
    assert.equal(parsed[3].data.length, count + 1);
    const prepared = await page.evaluate(() => window.prepared.map(e => ({ section: e.section, number: e.number, question: e.question, name: e.name })));
    prepared.forEach((e, index) => assert.deepEqual(parsed[3].data[index + 1].slice(0, 4), [e.section, e.number, e.question, e.name]));
    if (count === 5) { assert.equal(new Set(prepared.map(e => e.section)).size, 2); assert.equal(new Set(prepared.map(e => e.number)).size, 3); }
    await page.emulateMedia({ media: "print" });
    // Cada figura cabe numa página A4; o CSS permite quebra entre figuras do mesmo critério.
    const figures = await page.locator("figure").evaluateAll(nodes => nodes.map(n => ({ height: n.getBoundingClientRect().height,
      avoid: getComputedStyle(n).breakInside, ratio: n.querySelector("img").getBoundingClientRect().width / n.querySelector("img").getBoundingClientRect().height,
      expected: n.querySelector("img").naturalWidth / n.querySelector("img").naturalHeight })));
    for (const f of figures) { assert.ok(f.height < 950); assert.match(f.avoid, /avoid/); assert.ok(Math.abs(f.ratio - f.expected) < .01); }
    await page.emulateMedia({ media: "screen" });
    if (count === 5) await page.screenshot({ path: resolve(out, `previa-${label}.png`), fullPage: true });
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: resolve(out, `auditoria-${label}.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: "screen" });
    const metrics = await page.evaluate(() => ({ preparationMs: window.preparationMs, ticks: window.ticks, maxStallMs: Math.round(window.maxStallMs),
      bytes: window.prepared.reduce((sum, e) => sum + (e.image?.blob.size ?? 0), 0), progress: window.progress.length,
      pixels: window.prepared.reduce((sum, e) => sum + (e.image ? e.image.width * e.image.height : 0), 0) }));
    if (count) {
      for (mode of ["denied", "expired", "interrupted"]) {
        const error = await page.evaluate(async version => { try { await window.runReport(version); return ""; } catch(e) { return e.message; } }, version);
        assert.match(error, /Nenhum arquivo foi exportado/); assert.doesNotMatch(error, /token|http/);
      }
    }
    results.push({ version, count, ...metrics, xlsxBytes: bytes.length, requests, transformRequests, syntheticTransport: true });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(out, "result.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ output: out, results }, null, 2));
