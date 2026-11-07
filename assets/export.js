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

  // Печать прямо на странице, без нового окна: на телефоне в приложении с главного экрана
  // новое окно открывается без кнопки «назад», и вернуться на сайт нельзя
  function pdf(meta, html) {
    document.getElementById("print-root")?.remove();
    document.getElementById("print-css")?.remove();
    const st = document.createElement("style");
    st.id = "print-css";
    const scoped = CSS.split("}").map((r) => {
      const [sel, body] = r.split("{");
      if (!body) return "";
      if (sel.trim().startsWith("@page")) return `${sel}{${body}}`;
      const ss = sel.split(",").map((x) => x.trim()).filter(Boolean)
        .map((x) => (x === "html" || x === "body" ? "#print-root" : x === "*" ? "#print-root, #print-root *" : `#print-root ${x}`));
      return `${ss.join(", ")} {${body}}`;
    }).join("\n");
    st.textContent = `#print-root { display: none; }
      @media print { html, body { background: #fff !important; } body > *:not(#print-root) { display: none !important; } #print-root { display: block !important; } ${scoped} }`;
    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = `<h1>${xml(meta.title)}</h1><div class="meta">${xml(meta.sub || "")}</div>${html}`;
    document.head.appendChild(st);
    document.body.appendChild(root);
    const title = document.title;
    document.title = name(meta);
    const done = () => { document.title = title; root.remove(); st.remove(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.getElementById("print-root")) done(); }, 60000); }, 50);
  }


  /* ---------- PDF-файл на телефоне (pdfmake): без печати и просмотра, сразу в «Поделиться» ---------- */
  let pdfLib;
  function loadScript(src) {
    return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => fail(new Error("не загрузилась библиотека")); document.head.appendChild(s); });
  }
  function loadPdfMake() {
    if (window.pdfMake && window.pdfMake.vfs) return Promise.resolve(window.pdfMake);
    return pdfLib || (pdfLib = loadScript("assets/vendor/pdfmake.min.js")
      .then(() => loadScript("assets/vendor/vfs_fonts.js")).then(() => window.pdfMake));
  }
  function inl(node, st = {}) {
    const out = [];
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\s+/g, " ");
        if (t) out.push({ text: t, bold: st.b, italics: st.i, decoration: st.s ? "lineThrough" : st.u ? "underline" : undefined, background: st.fill ? "#" + st.fill : undefined, color: st.color });
      } else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === "BR") { out.push({ text: "\n" }); continue; }
        if (tag === "IMG") { out.push({ text: "[изображение]", color: "#5F6368" }); continue; }
        if (tag === "INPUT") { out.push({ text: n.checked ? "☑ " : "☐ " }); continue; }
        const s2 = { ...st };
        if (tag === "STRONG" || tag === "B") s2.b = true;
        if (tag === "EM" || tag === "I") s2.i = true;
        if (tag === "U") s2.u = true;
        if (tag === "DEL" || tag === "S") s2.s = true;
        if (tag === "A") s2.color = "#1A73E8";
        if (tag === "MARK") { const k = [...n.classList].map((c) => c.replace(/^hl-/, "")).find((c) => HL[c]); s2.fill = HL[k] || HL.yellow; }
        out.push(...inl(n, s2));
      }
    }
    return out;
  }
  function pblocks(root) {
    const out = [];
    let buf = [];
    const flush = () => { if (buf.length) { const d = document.createElement("span"); buf.splice(0).forEach((n) => d.appendChild(n.cloneNode(true))); const t = inl(d); if (t.some((x) => x.text.trim())) out.push({ text: t }); } };
    for (const n of root.childNodes) {
      const tag = n.nodeType === 1 ? n.tagName : "";
      if (!/^(P|H[1-6]|UL|OL|DIV|BLOCKQUOTE|TABLE|HR|PRE|SECTION|ARTICLE)$/.test(tag)) { buf.push(n); continue; }
      flush();
      if (/^H[1-6]$/.test(tag)) out.push({ text: inl(n), style: "h" + Math.min(+tag[1], 4) });
      else if (tag === "P") out.push({ text: inl(n) });
      else if (tag === "UL" || tag === "OL") {
        const items = [...n.children].filter((li) => li.tagName === "LI").map((li) => {
          const head = li.cloneNode(true); head.querySelectorAll("ul,ol").forEach((x) => x.remove());
          const subs = [...li.querySelectorAll(":scope > ul, :scope > ol")].flatMap((x) => { const d = document.createElement("div"); d.appendChild(x.cloneNode(true)); return pblocks(d); });
          return subs.length ? { stack: [{ text: inl(head) }, ...subs] } : { text: inl(head) };
        });
        out.push(tag === "OL" ? { ol: items } : { ul: items });
      } else if (tag === "TABLE") {
        const body = [...n.rows].map((r) => [...r.cells].map((c) => ({ text: inl(c), bold: c.tagName === "TH", fillColor: c.tagName === "TH" ? "#F1F3F4" : undefined })));
        const w = Math.max(...body.map((r) => r.length));
        body.forEach((r) => { while (r.length < w) r.push(""); });
        out.push({ table: { headerRows: n.tHead ? 1 : 0, widths: Array(w).fill("*"), body }, layout: { hLineColor: () => "#DADCE0", vLineColor: () => "#DADCE0", hLineWidth: () => 0.5, vLineWidth: () => 0.5 }, fontSize: 9.5 });
      } else if (tag === "HR") out.push({ canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: "#DADCE0" }], margin: [0, 2, 0, 6] });
      else if (tag === "PRE") out.push({ text: n.textContent, fontSize: 9, background: "#F1F3F4" });
      else if (tag === "BLOCKQUOTE") out.push({ stack: pblocks(n), margin: [12, 0, 0, 0], color: "#5F6368" });
      else if (tag === "DIV" && n.classList.contains("callout")) out.push({ table: { widths: ["*"], body: [[{ stack: pblocks(n), fillColor: "#F1F3F4" }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3, paddingBottom: () => 3 }, margin: [0, 2, 0, 2] });
      else out.push(...pblocks(n));
    }
    flush();
    return out;
  }
  async function pdfFile(meta, html) {
    const pm = await loadPdfMake();
    const div = document.createElement("div");
    div.innerHTML = html;
    const doc = {
      pageSize: "A4", pageMargins: [50, 56, 50, 56],
      info: { title: meta.title },
      defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.25, color: "#202124" },
      styles: { title: { fontSize: 18, bold: true }, sub: { fontSize: 9, color: "#5F6368" }, h1: { fontSize: 15, bold: true, margin: [0, 6, 0, 0] }, h2: { fontSize: 13.5, bold: true, margin: [0, 6, 0, 0] }, h3: { fontSize: 12, bold: true, margin: [0, 4, 0, 0] }, h4: { fontSize: 11, bold: true, margin: [0, 4, 0, 0] } },
      content: [{ text: meta.title, style: "title" }, { text: meta.sub || "", style: "sub", margin: [0, 0, 0, 8] }, ...pblocks(div)],
    };
    const blob = await new Promise((ok) => pm.createPdf(doc).getBlob(ok));
    await deliver(blob, name(meta) + ".pdf", "application/pdf");
  }

  const isMobile = () => matchMedia("(pointer: coarse)").matches || navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  async function deliver(blob, fname, type) {
    if (isMobile() && navigator.canShare) {
      const file = new File([blob], fname, { type });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: fname }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ---------- DOCX ---------- */
  let zipLib;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return zipLib || (zipLib = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "assets/vendor/jszip.min.js";
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
    await deliver(blob, name(meta) + ".docx", blob.type);
  }

  // На телефоне PDF собирается файлом и уходит в «Поделиться»; на компьютере печать браузера (шрифты лучше)
  const pdfAuto = (meta, html) => (isMobile() ? pdfFile(meta, html) : pdf(meta, html));
  window.KPIBExport = { pdf: pdfAuto, print: pdf, pdfFile, docx, name };
})();
