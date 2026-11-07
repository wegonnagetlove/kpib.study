/* Выгрузка конспекта в PDF (через печать браузера) и Word (.docx, собирается в браузере).
   Оформление: белый фон, Google Sans, межстрочный 1,25, без интервалов до и после абзаца.
   Имя файла: ЧТО=КТО=ГГММДД. */
(function () {
  const HL = { yellow: "FEEFC3", green: "CEEAD6", blue: "D2E3FC", purple: "E9D2FD", cyan: "CBF0F8", red: "FAD2CF", orange: "FEDFC8", "gradient-orange": "FEDFC8", gray: "F1F3F4" };
  const xml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

  function name(meta) {
    const d = meta.date || new Date();
    const yymmdd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    return safe(`${meta.what}=${meta.who}=${yymmdd}`);
  }

  /* ---------- PDF ---------- */
  const CSS = `
    @page { size: A4; margin: 20mm 18mm; }
    html, body { background: #fff; color: #202124; }
    body { font-family: "Google Sans", "Product Sans", Arial, sans-serif; font-size: 11.5pt; line-height: 1.25; margin: 0; }
    p, li, h1, h2, h3, h4, blockquote, .callout { margin: 0; padding-top: 0; padding-bottom: 0; }
    h1 { font-size: 20pt; margin-bottom: 4pt; } h2 { font-size: 15pt; margin-top: 10pt; } h3 { font-size: 13pt; margin-top: 8pt; } h4 { font-size: 12pt; margin-top: 6pt; }
    .meta { color: #5F6368; font-size: 10pt; margin-bottom: 10pt; }
    ul, ol { margin: 0; padding-left: 18pt; }
    .callout { background: #F1F3F4; border-radius: 6pt; padding: 4pt 8pt; margin: 3pt 0; }
    blockquote { border-left: 3pt solid #DADCE0; padding-left: 8pt; color: #5F6368; }
    table { border-collapse: collapse; width: 100%; margin: 4pt 0; } th, td { border: 0.5pt solid #DADCE0; padding: 3pt 5pt; text-align: left; vertical-align: top; } th { background: #F1F3F4; }
    a { color: #1A73E8; text-decoration: none; } img { max-width: 100%; }
    mark { color: inherit; padding: 0 1pt; border-radius: 2pt; } hr { border: 0; border-top: 0.5pt solid #DADCE0; }
    ${Object.entries(HL).map(([k, v]) => `mark.hl-${k} { background: #${v}; }`).join("\n")}
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;

  function pdf(meta, html) {
    const w = window.open("", "_blank");
    if (!w) return alert("Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта.");
    w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${xml(name(meta))}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap" rel="stylesheet">
      <style>${CSS}</style></head><body><h1>${xml(meta.title)}</h1><div class="meta">${xml(meta.sub || "")}</div>${html}</body></html>`);
    w.document.close();
    const go = () => setTimeout(() => { w.focus(); w.print(); }, 300);
    w.document.fonts && w.document.fonts.ready ? w.document.fonts.ready.then(go) : (w.onload = go);
  }

  /* ---------- DOCX ---------- */
  let zipLib;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return zipLib || (zipLib = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => ok(window.JSZip); s.onerror = () => fail(new Error("не загрузилась библиотека JSZip"));
      document.head.appendChild(s);
    }));
  }

  function runs(node, st = {}) {
    let out = "";
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\s+/g, " ");
        if (!t) continue;
        const pr = [st.b && "<w:b/>", st.i && "<w:i/>", st.u && '<w:u w:val="single"/>', st.s && "<w:strike/>",
          st.color && `<w:color w:val="${st.color}"/>`, st.mono && '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>',
          st.size && `<w:sz w:val="${st.size}"/><w:szCs w:val="${st.size}"/>`, st.fill && `<w:shd w:val="clear" w:color="auto" w:fill="${st.fill}"/>`].filter(Boolean).join("");
        out += `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
      } else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === "BR") { out += "<w:r><w:br/></w:r>"; continue; }
        if (tag === "INPUT" && n.type === "checkbox") { out += `<w:r><w:t xml:space="preserve">${n.checked ? "☑ " : "☐ "}</w:t></w:r>`; continue; }
        if (tag === "IMG") { out += `<w:r><w:t xml:space="preserve">[изображение${n.alt ? ": " + xml(n.alt) : ""}]</w:t></w:r>`; continue; }
        const s = { ...st };
        if (tag === "STRONG" || tag === "B") s.b = true;
        if (tag === "EM" || tag === "I") s.i = true;
        if (tag === "U") s.u = true;
        if (tag === "DEL" || tag === "S") s.s = true;
        if (tag === "CODE") s.mono = true;
        if (tag === "A") { s.color = "1A73E8"; }
        if (tag === "MARK") { const k = [...n.classList].map((c) => c.replace(/^hl-/, "")).find((c) => HL[c]); s.fill = HL[k] || HL.yellow; }
        out += runs(n, s);
      }
    }
    return out;
  }

  const P = (content, { style, shade, ind, num, border } = {}) => {
    const pr = [style && `<w:pStyle w:val="${style}"/>`, border && '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="DADCE0"/></w:pBdr>',
      shade && `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`, ind && `<w:ind w:left="${ind}" w:hanging="${num ? 280 : 0}"/>`].filter(Boolean).join("");
    return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ""}${num ? `<w:r><w:t xml:space="preserve">${xml(num)}\t</w:t></w:r>` : ""}${content}</w:p>`;
  };

  function blocks(root, ctx = {}) {
    let out = "";
    const inlineBuf = [];
    const flush = () => { if (inlineBuf.length) { const d = document.createElement("span"); inlineBuf.splice(0).forEach((n) => d.appendChild(n.cloneNode(true))); const r = runs(d); if (r.replace(/<[^>]+>/g, "").trim()) out += P(r, ctx); } };
    for (const n of root.childNodes) {
      const tag = n.nodeType === 1 ? n.tagName : "";
      const blockish = /^(P|H[1-6]|UL|OL|LI|DIV|BLOCKQUOTE|TABLE|HR|PRE|SECTION|ARTICLE)$/.test(tag);
      if (!blockish) { inlineBuf.push(n); continue; }
      flush();
      if (/^H[1-6]$/.test(tag)) out += P(runs(n), { ...ctx, style: "Heading" + Math.min(+tag[1] + (tag === "H1" ? 0 : 0), 4) });
      else if (tag === "P") out += P(runs(n), ctx);
      else if (tag === "UL" || tag === "OL") {
        let i = 0;
        const depth = (ctx.depth || 0) + 1;
        for (const li of n.children) {
          if (li.tagName !== "LI") continue;
          i++;
          const head = li.cloneNode(true);
          head.querySelectorAll("ul,ol").forEach((x) => x.remove());
          const mark = li.classList.contains("task") ? "" : tag === "OL" ? `${i}.` : "•";
          out += P(runs(head), { ...ctx, ind: 360 * depth, num: mark || undefined });
          for (const sub of li.querySelectorAll(":scope > ul, :scope > ol")) { const d = document.createElement("div"); d.appendChild(sub.cloneNode(true)); out += blocks(d, { ...ctx, depth }); }
        }
      } else if (tag === "TABLE") {
        const rows = [...n.rows].map((r) => `<w:tr>${[...r.cells].map((c) => `<w:tc><w:tcPr>${c.tagName === "TH" ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F3F4"/>' : ""}</w:tcPr>${P(runs(c, c.tagName === "TH" ? { b: true } : {}))}</w:tc>`).join("")}</w:tr>`).join("");
        out += `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>`).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${rows}</w:tbl>` + P("");
      } else if (tag === "HR") out += P("", { border: true });
      else if (tag === "PRE") out += n.textContent.split("\n").map((l) => P(`<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr><w:t xml:space="preserve">${xml(l)}</w:t></w:r>`, { ...ctx, shade: "F1F3F4" })).join("");
      else if (tag === "BLOCKQUOTE") out += blocks(n, { ...ctx, ind: 360 });
      else if (tag === "DIV" && n.classList.contains("callout")) out += blocks(n, { ...ctx, shade: "F1F3F4" });
      else if (tag === "DIV" && n.classList.contains("table-wrap")) out += blocks(n, ctx);
      else out += blocks(n, ctx);
    }
    flush();
    return out;
  }

  const FONT = '<w:rFonts w:ascii="Google Sans" w:hAnsi="Google Sans" w:eastAsia="Google Sans" w:cs="Google Sans"/>';
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:color w:val="202124"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="5F6368"/><w:sz w:val="20"/></w:rPr></w:style>
${[1, 2, 3, 4].map((l) => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[34, 30, 26, 24][l - 1]}"/><w:szCs w:val="${[34, 30, 26, 24][l - 1]}"/></w:rPr></w:style>`).join("")}
</w:styles>`;

  async function docx(meta, html) {
    const JSZip = await loadZip();
    const div = document.createElement("div");
    div.innerHTML = html;
    const body = P(`<w:r><w:t xml:space="preserve">${xml(meta.title)}</w:t></w:r>`, { style: "Title" })
      + (meta.sub ? P(`<w:r><w:t xml:space="preserve">${xml(meta.sub)}</w:t></w:r>`, { style: "Subtitle" }) : "") + P("") + blocks(div);
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1021" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const z = new JSZip();
    z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    z.file("word/document.xml", doc);
    z.file("word/styles.xml", STYLES);
    const blob = await z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name(meta) + ".docx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  window.KPIBExport = { pdf, docx, name };
})();
