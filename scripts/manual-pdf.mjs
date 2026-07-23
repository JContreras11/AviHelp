// Genera el PDF del manual desde docs/MANUAL.md con la identidad visual de Avi
// (Young Serif + Gabriela, paleta teal/morado, logo). marked → HTML → Playwright PDF.
// Uso: node scripts/manual-pdf.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";
import { chromium } from "@playwright/test";

const ROOT = new URL("..", import.meta.url).pathname;
const b64 = (p) => readFileSync(ROOT + p).toString("base64");

const md = readFileSync(ROOT + "docs/MANUAL.md", "utf8");
const logo = b64("public/avi-logo.png");          // logotipo completo (isotipo + "avi")
const iso = b64("public/avi-iso.png");
const youngSerif = b64("src/app/fonts/YoungSerif-Regular.ttf");
const gabriela = b64("src/app/fonts/Gabriela-Regular.ttf");
const cuerpo = marked.parse(md, { gfm: true, breaks: false });

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @font-face { font-family:"Young Serif"; src:url(data:font/ttf;base64,${youngSerif}) format("truetype"); }
  @font-face { font-family:"Gabriela"; src:url(data:font/ttf;base64,${gabriela}) format("truetype"); }
  /* Paleta de marca: teal (primario) + morado (secundario) + tinta */
  :root { --teal:#068A76; --teal-viv:#00E4BE; --morado:#8B3FC4; --tinta:#1D1D1B; --gris:#5b6472; --linea:#e6e8ee; }
  * { box-sizing:border-box; }
  body { font-family:"Gabriela",Georgia,serif; color:var(--tinta); font-size:11pt; line-height:1.6; margin:0; }
  h1,h2,h3,h4 { font-family:"Young Serif",Georgia,serif; letter-spacing:-.01em; }
  /* Portada */
  .cover { height:247mm; display:flex; flex-direction:column; justify-content:center; align-items:center;
           text-align:center; background:linear-gradient(160deg,#eafff9,#f3eaff); border-radius:14px;
           page-break-after:always; padding:20mm; }
  .cover img { width:260px; margin-bottom:8px; }
  .cover h1 { font-size:30pt; color:var(--teal); margin:6px 0; }
  .cover .sub { font-family:"Gabriela",serif; font-size:13.5pt; color:var(--gris); max-width:135mm; }
  .cover .meta { margin-top:30px; font-size:10.5pt; color:var(--gris); }
  .cover .tag { display:inline-block; margin-top:10px; padding:6px 16px; border-radius:999px;
                background:var(--teal); color:#fff; font-size:9.5pt; font-weight:600; font-family:"Gabriela",serif; }
  .content { padding:0 2mm; }
  h1 { font-size:19pt; color:var(--teal); border-bottom:3px solid var(--teal-viv);
       padding-bottom:5px; margin:26px 0 12px; page-break-before:always; page-break-after:avoid; }
  h1:first-of-type { page-break-before:avoid; }
  h2 { font-size:14pt; color:var(--morado); margin:20px 0 8px; page-break-after:avoid; }
  h3 { font-size:12pt; color:var(--tinta); margin:16px 0 6px; page-break-after:avoid; }
  h4 { font-size:11pt; color:var(--gris); margin:12px 0 4px; }
  p { margin:7px 0; }
  ul,ol { margin:7px 0; padding-left:20px; } li { margin:3px 0; }
  a { color:var(--teal); text-decoration:none; }
  strong { color:#111; }
  hr { border:none; border-top:1px solid var(--linea); margin:18px 0; }
  code { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:9.5pt;
         background:#e9fbf6; color:var(--teal); padding:1px 5px; border-radius:4px; }
  blockquote { margin:12px 0; padding:8px 14px; background:#f6efff; border-left:4px solid var(--morado);
               border-radius:0 8px 8px 0; color:#42465a; }
  blockquote p { margin:3px 0; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:9.8pt; page-break-inside:avoid; }
  th { background:var(--teal); color:#fff; text-align:left; padding:7px 9px; font-weight:600; }
  td { padding:6px 9px; border-bottom:1px solid var(--linea); vertical-align:top; }
  tr:nth-child(even) td { background:#f2fffb; }
  table code { background:#eafaf6; }
</style></head><body>
  <div class="cover">
    <img src="data:image/png;base64,${logo}" alt="Avi">
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
  format: "A4", printBackground: true,
  margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%; font-size:8pt; color:#9aa0ad; padding:0 14mm; display:flex; justify-content:space-between;">' +
    '<span>Manual de AviHelp</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log("PDF generado con identidad Avi: docs/Manual_AviHelp.pdf");
