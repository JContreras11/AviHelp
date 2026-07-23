// Genera el PDF final del manual desde docs/MANUAL.md (marked → HTML → Playwright PDF).
// Uso: node scripts/manual-pdf.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";
import { chromium } from "@playwright/test";

const ROOT = new URL("..", import.meta.url).pathname;
const md = readFileSync(ROOT + "docs/MANUAL.md", "utf8");
const logo = readFileSync(ROOT + "public/icon-512.png").toString("base64");

// Quita el bloque de metadatos de arriba (título + links) para no duplicar con la portada.
const cuerpo = marked.parse(md, { gfm: true, breaks: false });

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  :root { --violeta:#6d28d9; --violeta2:#8b5cf6; --tinta:#1f2430; --gris:#5b6472; --linea:#e6e8ee; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
         color:var(--tinta); font-size:11pt; line-height:1.55; margin:0; }
  /* Portada */
  .cover { height:247mm; display:flex; flex-direction:column; justify-content:center; align-items:center;
           text-align:center; background:linear-gradient(160deg,#f6f3ff,#eef4ff); border-radius:14px;
           page-break-after:always; padding:20mm; }
  .cover img { width:96px; height:96px; margin-bottom:18px; }
  .cover h1 { font-size:34pt; color:var(--violeta); margin:0 0 6px; letter-spacing:-.5px; }
  .cover .sub { font-size:14pt; color:var(--gris); max-width:130mm; }
  .cover .meta { margin-top:34px; font-size:10.5pt; color:var(--gris); }
  .cover .tag { display:inline-block; margin-top:10px; padding:5px 14px; border-radius:999px;
                background:var(--violeta); color:#fff; font-size:9.5pt; font-weight:600; }
  /* Contenido */
  .content { padding:0 2mm; }
  h1 { font-size:19pt; color:var(--violeta); border-bottom:3px solid var(--violeta2);
       padding-bottom:5px; margin:26px 0 12px; page-break-before:always; page-break-after:avoid; }
  h1:first-of-type { page-break-before:avoid; }
  h2 { font-size:14pt; color:#4c1d95; margin:20px 0 8px; page-break-after:avoid; }
  h3 { font-size:12pt; color:var(--tinta); margin:16px 0 6px; page-break-after:avoid; }
  h4 { font-size:11pt; color:var(--gris); margin:12px 0 4px; }
  p { margin:7px 0; }
  ul,ol { margin:7px 0; padding-left:20px; }
  li { margin:3px 0; }
  a { color:var(--violeta); text-decoration:none; }
  strong { color:#111; }
  hr { border:none; border-top:1px solid var(--linea); margin:18px 0; }
  code { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:9.5pt;
         background:#f2f0fb; color:#5b21b6; padding:1px 5px; border-radius:4px; }
  blockquote { margin:12px 0; padding:8px 14px; background:#f7f5ff; border-left:4px solid var(--violeta2);
               border-radius:0 8px 8px 0; color:#42465a; }
  blockquote p { margin:3px 0; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:9.8pt; page-break-inside:avoid; }
  th { background:var(--violeta); color:#fff; text-align:left; padding:7px 9px; font-weight:600; }
  td { padding:6px 9px; border-bottom:1px solid var(--linea); vertical-align:top; }
  tr:nth-child(even) td { background:#faf9ff; }
  table code { background:#ede9fe; }
</style></head><body>
  <div class="cover">
    <img src="data:image/png;base64,${logo}" alt="AviHelp">
    <h1>Manual de AviHelp</h1>
    <div class="sub">Plataforma de gestión de ayuda humanitaria — donaciones, inventario, logística, transporte y voluntarios</div>
    <div class="meta">
      Guía completa de todas las pantallas y de cómo usar el sistema<br>
      <span class="tag">Julio 2026 · Documento para la Fundación</span>
    </div>
  </div>
  <div class="content">${cuerpo}</div>
</body></html>`;

writeFileSync(ROOT + "docs/_manual.html", html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({
  path: ROOT + "docs/Manual_AviHelp.pdf",
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%; font-size:8pt; color:#9aa0ad; padding:0 14mm; display:flex; justify-content:space-between;">' +
    '<span>Manual de AviHelp</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log("PDF generado: docs/Manual_AviHelp.pdf");
