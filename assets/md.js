/* Небольшой markdown-рендер под выгрузку Craft: заголовки, списки, задачи, таблицы,
   цитаты, выноски <div class="callout">, выделения <mark>, ссылки, картинки.
   Формулы вида =SUM(...) в таблицах пересчитываются по строке. */
(function (global) {
  "use strict";

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ALLOWED = /^<\/?(mark|br|u|s|sub|sup)(\s+class="[\w-]+")?\s*\/?>$/i;

  function safeUrl(u) {
    u = u.trim();
    if (/^(https?:|mailto:|tel:|#|\.{0,2}\/)/i.test(u)) return u;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return "https://" + u;
    return "#";
  }

  function inline(src) {
    const keep = [];
    const stash = (html) => { keep.push(html); return "\u0000" + (keep.length - 1) + "\u0000"; };
    let s = src;
    // код
    s = s.replace(/`([^`]+)`/g, (_, c) => stash("<code>" + esc(c) + "</code>"));
    // разрешённые html-теги
    s = s.replace(/<\/?[a-z][^>]*>/gi, (t) => (ALLOWED.test(t) ? stash(t) : t));
    // картинки и ссылки
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, u) =>
      stash(`<img loading="lazy" alt="${esc(alt)}" src="${esc(safeUrl(u))}">`));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, text, u) => {
      const url = safeUrl(u);
      const ext = url.startsWith("http") && !url.startsWith(location.origin);
      const file = /\.(pdf|docx?|pptx?|xlsx?|ppt)$/i.test(text.trim());
      return stash(`<a href="${esc(url)}"${ext ? ' target="_blank" rel="noopener"' : ""}${file ? ' class="file"' : ""}>`) +
        text + stash("</a>");
    });
    // голые адреса
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, u) =>
      pre + stash(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`));
    s = esc(s);
    s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
    s = s.replace(/\*\*/g, "");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }

  function evalFormula(cells, idx) {
    // =SUM(...) считаем как сумму числовых ячеек строки между ФИО и итоговой колонкой
    let sum = 0, any = false;
    for (let i = 1; i < cells.length; i++) {
      if (i === idx) continue;
      const v = parseFloat(String(cells[i]).replace(",", "."));
      if (!isNaN(v) && /^\s*-?[\d.,]+\s*$/.test(cells[i])) { sum += v; any = true; }
    }
    return any ? String(Math.round(sum * 100) / 100) : "0";
  }

  function splitRow(line) {
    let l = line.trim();
    if (l.startsWith("|")) l = l.slice(1);
    if (l.endsWith("|")) l = l.slice(0, -1);
    return l.split("|").map((c) => c.trim());
  }

  function table(lines) {
    const head = splitRow(lines[0]);
    const body = lines.slice(2).map(splitRow);
    let h = '<div class="table-wrap"><table><thead><tr>' +
      head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>";
    for (const row of body) {
      h += "<tr>" + row.map((c, i) => {
        if (/^=SUM\(/i.test(c)) return '<td class="num total">' + evalFormula(row, i) + "</td>";
        const num = /^(—|-|–|[\d.,]+)$/.test(c);
        return "<td" + (num ? ' class="num"' : "") + ">" + inline(c) + "</td>";
      }).join("") + "</tr>";
    }
    return h + "</tbody></table></div>";
  }

  function render(src) {
    const lines = src.replace(/\r/g, "").split("\n");
    let out = "", i = 0, para = [];
    const flush = () => {
      if (para.length) { out += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; }
    };
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      if (!t) { flush(); i++; continue; }
      // выноска
      const div = t.match(/^<div class="([\w-]+)"[^>]*>$/);
      if (div) {
        flush();
        let depth = 1, j = i + 1, inner = [];
        for (; j < lines.length; j++) {
          if (/^<div\b/.test(lines[j].trim())) depth++;
          if (lines[j].trim() === "</div>") { depth--; if (!depth) break; }
          inner.push(lines[j]);
        }
        out += `<div class="${div[1]}">` + render(inner.join("\n")) + "</div>";
        i = j + 1; continue;
      }
      if (t === "</div>") { i++; continue; }
      const hm = t.match(/^(#{1,6})\s+(.*)$/);
      if (hm) {
        flush();
        const lvl = Math.min(6, hm[1].length + 1);
        const text = inline(hm[2]);
        const id = "h-" + hm[2].toLowerCase().replace(/<[^>]+>|[*`]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
        out += `<h${lvl} id="${esc(id)}">${text}</h${lvl}>`;
        i++; continue;
      }
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(t)) { flush(); out += "<hr>"; i++; continue; }
      if (t.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{3}/.test(lines[i + 1].trim())) {
        flush();
        const tl = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) tl.push(lines[i++]);
        out += table(tl); continue;
      }
      if (t.startsWith(">")) {
        flush();
        const q = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) q.push(lines[i++].trim().replace(/^>\s?/, ""));
        out += "<blockquote>" + render(q.join("\n")) + "</blockquote>"; continue;
      }
      const lm = t.match(/^([-*+]|\d+[.)])\s+(.*)$/);
      if (lm) {
        flush();
        const ordered = /\d/.test(lm[1]);
        const start = ordered ? parseInt(lm[1], 10) : 1;
        let items = [];
        while (i < lines.length) {
          const m = lines[i].trim().match(/^([-*+]|\d+[.)])\s+(.*)$/);
          if (m && /\d/.test(m[1]) === ordered) { items.push(m[2]); i++; }
          else if (!lines[i].trim() && i + 1 < lines.length) {
            const n = lines[i + 1].trim().match(/^([-*+]|\d+[.)])\s+/);
            if (n && /\d/.test(n[1]) === ordered) { i++; continue; }
            break;
          } else break;
        }
        const tag = ordered ? "ol" : "ul";
        out += `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>` + items.map((it) => {
          const task = it.match(/^\[([ xX])\]\s*(.*)$/);
          if (task) return `<li class="task"><input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}>${inline(task[2])}</li>`;
          return "<li>" + inline(it) + "</li>";
        }).join("") + `</${tag}>`;
        continue;
      }
      para.push(t);
      i++;
    }
    flush();
    return out;
  }

  function plain(src) {
    return src
      .replace(/<[^>]+>/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>|\|)\s*/gm, "")
      .replace(/[*_`|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  global.MD = { render, inline, plain, esc };
})(window);
