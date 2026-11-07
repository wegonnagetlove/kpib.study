/* Редактор рабочего стола: лекции, страницы, посты. Сохраняет прямо в репозиторий
   через GitHub API по личному токену, который хранится только в этом браузере. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const K = () => window.KPIB;
  const esc = (s) => window.MD.esc(String(s ?? ""));

  /* ---------- GitHub ---------- */
  const enc = (text) => {
    const bytes = typeof text === "string" ? new TextEncoder().encode(text) : new Uint8Array(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

  const GH = {
    get repo() { return K().S.group.repo; },
    get token() { return K().store.get("gh", null); },
    async req(method, path, body, token) {
      const { owner, name } = this.repo;
      const r = await fetch(`https://api.github.com/repos/${owner}/${name}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token || this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 404 && method === "GET") return null;
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = r.status === 401 ? "Токен не подходит или истёк" : r.status === 403 ? "У токена нет права записи (Contents: Read and write)" : r.status === 409 ? "Файл успели изменить, повторите" : data.message || r.status;
        throw Object.assign(new Error(msg), { status: r.status });
      }
      return data;
    },
    async get(path) {
      const r = await this.req("GET", `/contents/${encPath(path)}?ref=${this.repo.branch}&t=${Date.now()}`);
      return r ? { text: dec(r.content), sha: r.sha } : null;
    },
    async put(path, content, message, retry = true) {
      const cur = await this.req("GET", `/contents/${encPath(path)}?ref=${this.repo.branch}&t=${Date.now()}`);
      try {
        return await this.req("PUT", `/contents/${encPath(path)}`, { message, content: enc(content), branch: this.repo.branch, ...(cur ? { sha: cur.sha } : {}) });
      } catch (e) {
        if (e.status === 409 && retry) return this.put(path, content, message, false);
        throw e;
      }
    },
    async remove(path, message) {
      const cur = await this.req("GET", `/contents/${encPath(path)}?ref=${this.repo.branch}`);
      if (cur) await this.req("DELETE", `/contents/${encPath(path)}`, { message, sha: cur.sha, branch: this.repo.branch });
    },
    async updateJSON(path, fn, message) {
      const cur = await this.get(path);
      const data = fn(cur ? JSON.parse(cur.text) : null);
      await this.put(path, JSON.stringify(data, null, 1) + "\n", message);
      return data;
    },
  };

  /* ---------- Вспомогательное ---------- */
  function excerpt(mdText, n = 320) {
    let t = mdText.replace(/^#{1,6} .*$/gm, "").replace(/^\|.*$/gm, "");
    t = window.MD.plain(t);
    return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…";
  }
  const sortPages = (pages) => {
    const other = pages.filter((p) => !p.lecture);
    const lec = pages.filter((p) => p.lecture).sort((a, b) => a.slug.localeCompare(b.slug));
    return other.concat(lec);
  };
  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Сохраняю…"; }
    else btn.textContent = btn.dataset.label || btn.textContent;
  }
  const fail = (e) => K().toast("Не сохранилось: " + e.message);
  const done = () => K().toast("Сохранено. У всех на сайте появится через 1–2 минуты");

  function needToken() {
    if (GH.token) return false;
    location.hash = "#/edit/setup?back=" + encodeURIComponent(location.hash);
    return true;
  }

  /* ---------- Markdown-редактор ---------- */
  const HL = [["yellow", "Определение"], ["green", "Вывод"], ["blue", "НПА, дата"], ["purple", "Автор"], ["cyan", "Акцент"]];
  const blobs = {};

  function editorHTML() {
    return `<div class="ed">
      <div class="ed-bar">
        <button type="button" data-cmd="h2" title="Заголовок">Заг.</button>
        <button type="button" data-cmd="h3" title="Подзаголовок">Подз.</button>
        <button type="button" data-cmd="b" title="Жирный, Ctrl+B"><b>Ж</b></button>
        <button type="button" data-cmd="i" title="Курсив, Ctrl+I"><i>К</i></button>
        <button type="button" data-cmd="ul" title="Список">•</button>
        <button type="button" data-cmd="ol" title="Нумерованный список">1.</button>
        <button type="button" data-cmd="task" title="Задача">☐</button>
        <button type="button" data-cmd="callout" title="Выноска">▭</button>
        <button type="button" data-cmd="quote" title="Цитата">❝</button>
        <button type="button" data-cmd="link" title="Ссылка">🔗</button>
        <button type="button" data-cmd="table" title="Таблица">▦</button>
        <button type="button" data-cmd="hr" title="Разделитель">—</button>
        <label class="ed-file" title="Картинка или файл">📎<input type="file" hidden></label>
        <span class="ed-sep"></span>
        ${HL.map(([c, t], i) => `<button type="button" class="hl-btn" data-hl="${c}" title="${t}, Ctrl+${i + 1}"><mark class="hl-${c}">${t}</mark></button>`).join("")}
        <button type="button" data-cmd="unmark" title="Снять выделение">✕</button>
      </div>
      <div class="ed-tabs"><button type="button" class="tab active" data-view="write">Текст</button><button type="button" class="tab" data-view="preview">Просмотр</button><span class="ed-status muted small"></span></div>
      <textarea class="ed-text" spellcheck="true" placeholder="Пишите здесь. Выделите фрагмент и нажмите цвет, чтобы разметить определение, вывод, НПА, автора или акцент."></textarea>
      <div class="ed-preview md reading" hidden></div>
    </div>`;
  }

  function mountEditor(root, initial, draftKey) {
    const ta = $(".ed-text", root), pv = $(".ed-preview", root), status = $(".ed-status", root);
    const draft = K().store.get("draft:" + draftKey, null);
    ta.value = draft && draft.text !== initial ? draft.text : initial;
    if (draft && draft.text !== initial) status.textContent = "восстановлен несохранённый черновик";
    const autosize = () => { ta.style.height = "auto"; ta.style.height = Math.max(320, ta.scrollHeight + 4) + "px"; };
    let t;
    ta.addEventListener("input", () => {
      autosize();
      clearTimeout(t);
      t = setTimeout(() => { K().store.set("draft:" + draftKey, { text: ta.value, at: Date.now() }); status.textContent = "черновик сохранён в браузере"; }, 600);
    });
    requestAnimationFrame(autosize);

    const sel = () => [ta.selectionStart, ta.selectionEnd, ta.value.slice(ta.selectionStart, ta.selectionEnd)];
    const set = (text, a, b) => {
      ta.focus();
      ta.setRangeText(text, a, b, "end");
      ta.dispatchEvent(new Event("input"));
    };
    const wrap = (l, r, ph = "текст") => {
      const [a, b, s] = sel();
      set(l + (s || ph) + r, a, b);
      if (!s) { ta.selectionStart = a + l.length; ta.selectionEnd = a + l.length + ph.length; }
    };
    const lines = (fn) => {
      let [a, b] = sel();
      a = ta.value.lastIndexOf("\n", a - 1) + 1;
      const e = ta.value.indexOf("\n", b); b = e < 0 ? ta.value.length : e;
      const block = ta.value.slice(a, b).split("\n").map(fn).join("\n");
      set(block, a, b);
    };
    const block = (text) => {
      const [a, b] = sel();
      const pre = a > 0 && ta.value[a - 1] !== "\n" ? "\n\n" : "";
      set(pre + text + "\n", a, b);
    };
    const cmds = {
      h2: () => lines((l) => "## " + l.replace(/^#+\s*/, "")),
      h3: () => lines((l) => "### " + l.replace(/^#+\s*/, "")),
      b: () => wrap("**", "**"),
      i: () => wrap("*", "*"),
      ul: () => lines((l) => (l.startsWith("- ") ? l.slice(2) : "- " + l)),
      ol: () => { let n = 0; lines((l) => `${++n}. ` + l.replace(/^\d+\.\s*/, "")); },
      task: () => lines((l) => "- [ ] " + l.replace(/^- (\[[ x]\] )?/, "")),
      callout: () => { const [, , s] = sel(); block(`<div class="callout" markdown>\n\n${s || "Важно: "}\n\n</div>`); },
      quote: () => lines((l) => "> " + l),
      link: () => { const u = prompt("Адрес ссылки", "https://"); if (u) wrap("[", `](${u})`, "ссылка"); },
      table: () => block("| Столбец | Столбец |\n| --- | --- |\n|  |  |"),
      hr: () => block("******"),
      unmark: () => { const [a, b, s] = sel(); set(s.replace(/<\/?mark[^>]*>/g, ""), a, b); },
    };
    root.querySelectorAll("[data-cmd]").forEach((b) => (b.onclick = () => cmds[b.dataset.cmd]()));
    const mark = (c) => wrap(`<mark class="hl-${c}">`, "</mark>");
    root.querySelectorAll("[data-hl]").forEach((b) => (b.onclick = () => mark(b.dataset.hl)));
    ta.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b" || k === "и") { e.preventDefault(); cmds.b(); }
      else if (k === "i" || k === "ш") { e.preventDefault(); cmds.i(); }
      else if (/^[1-5]$/.test(k)) { e.preventDefault(); mark(HL[+k - 1][0]); }
      else if (k === "s" || k === "ы") { e.preventDefault(); root.closest("form")?.requestSubmit(); }
    });

    const showPreview = () => {
      pv.innerHTML = K().md(ta.value) || '<p class="muted">Пусто</p>';
      pv.querySelectorAll("img").forEach((img) => { const p = img.getAttribute("src"); if (blobs[p]) img.src = blobs[p]; });
    };
    root.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => {
      root.querySelectorAll("[data-view]").forEach((x) => x.classList.toggle("active", x === b));
      const prev = b.dataset.view === "preview";
      ta.hidden = prev; pv.hidden = !prev;
      if (prev) showPreview();
    }));

    $(".ed-file input", root).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (needToken()) return;
      if (f.size > 20 * 1024 * 1024) return K().toast("Файл больше 20 МБ");
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
      const safe = f.name.replace(/[^\wа-яё.-]+/gi, "_");
      const path = `assets/uploads/${stamp}-${safe}`;
      status.textContent = "загружаю файл…";
      try {
        await GH.put(path, await f.arrayBuffer(), `Файл: ${f.name}`);
        const rel = "./" + path;
        if (f.type.startsWith("image/")) { blobs[rel] = URL.createObjectURL(f); block(`![${f.name}](${rel})`); }
        else block(`[${f.name}](${rel})`);
        status.textContent = "файл загружен";
      } catch (err) { status.textContent = ""; fail(err); }
      e.target.value = "";
    };
    return {
      get value() { return ta.value; },
      set value(v) { ta.value = v; autosize(); },
      clearDraft() { K().store.set("draft:" + draftKey, null); },
    };
  }

  /* ---------- Страницы редактора ---------- */
  function setup(query) {
    const back = new URLSearchParams(query || "").get("back") || "#/";
    const has = !!GH.token;
    const { owner, name } = GH.repo;
    K().S && (document.title = "Редактор · 104 КПИБ");
    $("#main").innerHTML = `<article class="card article setup"><h1>Доступ к редактированию</h1>
      ${has ? `<p>Редактирование в этом браузере включено.</p><p><button class="tab" id="logout">Выйти из редактора</button> <a class="tab" href="${esc(back)}">Вернуться</a></p>` : `
      <p><b>Текст страниц (ДЗ, ВКР, БРС, дисциплины, конспекты из Craft) правится в Craft</b>: кнопка «Редактировать в Craft» на каждой такой странице, токен не нужен. Сайт подтягивает изменения раз в час.</p><p>Токен нужен только чтобы прямо с сайта добавлять новые лекции, мероприятия и посты. Сайт хранит всё в репозитории <b>${esc(owner)}/${esc(name)}</b>. Чтобы писать прямо отсюда, нужен личный токен GitHub с правом записи. Один раз на каждом устройстве.</p>
      <ol>
        <li>Откройте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">создание fine-grained токена</a>.</li>
        <li>Token name: «Рабочий стол 104». Expiration: до конца учебного года.</li>
        <li>Repository access: <b>Only select repositories</b> → <b>${esc(name)}</b>.</li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Остальное не трогать.</li>
        <li>Generate token, скопировать и вставить ниже.</li>
      </ol>
      <form id="tok" style="display:flex;gap:8px;flex-wrap:wrap"><input id="tok-in" class="ed-input" style="flex:1;min-width:240px" placeholder="github_pat_…" autocomplete="off" required><button class="tab active" id="tok-btn">Проверить и сохранить</button></form>
      <p class="small muted">Токен хранится только в этом браузере и отправляется только в GitHub. На чужом компьютере после работы нажмите «Выйти». Однокурсникам, которые тоже будут писать, нужно быть соавторами репозитория (Settings → Collaborators) и сделать свой токен.</p>`}
    </article>`;
    if (has) return ($("#logout").onclick = () => { K().store.set("gh", null); K().toast("Токен удалён из браузера"); setup(query); });
    $("#tok").onsubmit = async (e) => {
      e.preventDefault();
      const t = $("#tok-in").value.trim(), btn = $("#tok-btn");
      busy(btn, true, "Проверяю…");
      try {
        const r = await GH.req("GET", "", null, t);
        if (!r.permissions || !r.permissions.push) throw new Error("у этого аккаунта нет права записи в репозиторий");
        K().store.set("gh", t);
        K().toast("Готово, можно писать");
        location.hash = back;
      } catch (err) { busy(btn, false); K().toast("Не получилось: " + err.message); }
    };
  }

  function subjectOptions(sel) {
    return Object.entries(K().SUBJ()).map(([c, s]) => `<option value="${c}"${c === sel ? " selected" : ""}>${esc(s.short)} · ${esc(s.title)}</option>`).join("");
  }

  function titleFor(dateISO, theme) {
    const d = new Date(dateISO + "T00:00");
    return `Лекция от ${d.getDate()} ${K().MONF[d.getMonth()]}` + (theme ? `. ${theme}` : "");
  }

  async function lectureForm(code, slug) {
    if (needToken()) return;
    const S = K().S;
    code = code || Object.keys(K().SUBJ())[0];
    const page = slug && S.tree.subjects.find((s) => s.code === code)?.pages.find((p) => p.slug === slug);
    const isLecture = !slug || (page && page.lecture);
    const dateISO = slug ? K().lectureDate(slug) || K().iso(K().today()) : K().iso(K().today());
    const theme = page ? page.title.replace(/^Лекция от \d+ \S+\.?\s*/i, "") : "";
    $("#main").innerHTML = `<form class="card article" id="f">
      <div class="crumbs"><a href="#/s/${code}">${esc(K().SUBJ()[code].title)}</a></div>
      <h1>${slug ? "Редактирование" : "Новая лекция"}</h1>
      ${isLecture ? `<div class="ed-grid">
        <label>Дисциплина<select id="f-subj" class="ed-input" ${slug ? "disabled" : ""}>${subjectOptions(code)}</select></label>
        <label>Дата<input type="date" id="f-date" class="ed-input" value="${dateISO}" ${slug ? "disabled" : ""}></label>
        <label class="wide">Тема (необязательно)<input id="f-theme" class="ed-input" value="${esc(theme)}" placeholder="например: Правовой статус ИИ"></label>
      </div><p class="small muted" id="f-note"></p>` : `<label>Заголовок<input id="f-title" class="ed-input" value="${esc(page ? page.title : "")}"></label>`}
      ${editorHTML()}
      <div class="ed-actions"><button class="tab active" id="f-save">Опубликовать</button><a class="tab" href="${slug ? `#/s/${code}/${slug}` : `#/s/${code}`}">Отмена</a><span class="muted small">Ctrl+S — опубликовать</span></div>
    </form>`;
    const key = () => slug ? `${code}/${slug}` : `new:${$("#f-subj").value}/${$("#f-date").value}`;
    let ed;
    const load = async () => {
      const c = slug ? code : $("#f-subj").value;
      const s = slug || $("#f-date").value.slice(5);
      const exists = S.tree.subjects.find((x) => x.code === c)?.pages.find((p) => p.slug === s);
      let text = "";
      if (exists) {
        const remote = await GH.get(K().subjPath(c, s)).catch(() => null);
        text = remote ? remote.text : await K().getMD(K().subjPath(c, s));
        if (text.trim().length < 3) text = "";
        if (!slug && $("#f-note")) $("#f-note").textContent = exists.empty ? "На эту дату в Craft была пустая карточка, текст запишется в неё." : "Лекция на эту дату уже есть, открыт её текст.";
        if (!slug && !exists.empty && $("#f-theme") && !$("#f-theme").value) $("#f-theme").value = exists.title.replace(/^Лекция от \d+ \S+\.?\s*/i, "");
      } else if ($("#f-note")) $("#f-note").textContent = "";
      if (!ed) ed = mountEditor($(".ed"), text, key());
      else ed.value = (K().store.get("draft:" + key(), null) || {}).text || text;
    };
    await load();
    if (!slug) { $("#f-subj").onchange = load; $("#f-date").onchange = load; }

    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#f-save");
      const c = slug ? code : $("#f-subj").value;
      const s = slug || $("#f-date").value.slice(5);
      const text = ed.value.trim() + "\n";
      const title = isLecture ? titleFor(slug ? dateISO : $("#f-date").value, $("#f-theme").value.trim()) : ($("#f-title").value.trim() || page.title);
      busy(btn, true);
      try {
        await GH.put(K().subjPath(c, s), text, `${isLecture ? "Лекция" : "Страница"}: ${K().SUBJ()[c].short}, ${title}`);
        const entry = { slug: s, title, depth: page ? page.depth : 0, lecture: isLecture, empty: text.trim().length < 3, chars: text.length, excerpt: excerpt(text), source: "site" };
        const tree = await GH.updateJSON("data/tree.json", (t) => {
          const subj = t.subjects.find((x) => x.code === c);
          const i = subj.pages.findIndex((p) => p.slug === s);
          if (i >= 0) subj.pages[i] = Object.assign({}, subj.pages[i], entry, { depth: subj.pages[i].depth });
          else subj.pages.push(entry);
          subj.pages = sortPages(subj.pages);
          return t;
        }, `Оглавление: ${K().SUBJ()[c].short}, ${title}`);
        S.tree = tree;
        S.md[K().subjPath(c, s)] = text;
        K().invalidateSearch();
        ed.clearDraft();
        done();
        location.hash = `#/s/${c}/${s}`;
      } catch (err) { busy(btn, false); fail(err); }
    };
  }

  async function subjectIndexForm(code) {
    if (needToken()) return;
    $("#main").innerHTML = `<form class="card article" id="f"><div class="crumbs"><a href="#/s/${code}">${esc(K().SUBJ()[code].title)}</a></div>
      <h1>Страница дисциплины</h1><p class="small muted">Блок «О дисциплине»: файлы, ссылки, правила. Ссылки на лекции добавляются сами.</p>
      ${editorHTML()}<div class="ed-actions"><button class="tab active" id="f-save">Опубликовать</button><a class="tab" href="#/s/${code}">Отмена</a></div></form>`;
    const path = K().subjPath(code);
    const remote = await GH.get(path).catch(() => null);
    const ed = mountEditor($(".ed"), remote ? remote.text : await K().getMD(path), "idx:" + code);
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#f-save"); busy(btn, true);
      try {
        await GH.put(path, ed.value.trim() + "\n", `Дисциплина: ${K().SUBJ()[code].short}`);
        K().S.md[path] = ed.value; ed.clearDraft(); done(); location.hash = `#/s/${code}`;
      } catch (err) { busy(btn, false); fail(err); }
    };
  }

  async function sectionForm(slug) {
    if (needToken()) return;
    const titles = { hw: "Домашние задания", brs: "Баллы (БРС)", vkr: "ВКР", schedule: "Расписание (текст)", contacts: "Контакты (текст)", events: "Конференции (вводный текст)" };
    const path = `content/pages/${slug}.md`;
    $("#main").innerHTML = `<form class="card article" id="f"><h1>${esc(titles[slug] || slug)}</h1>
      ${editorHTML()}<div class="ed-actions"><button class="tab active" id="f-save">Опубликовать</button><a class="tab" href="#/${slug}">Отмена</a></div></form>`;
    const remote = await GH.get(path).catch(() => null);
    const ed = mountEditor($(".ed"), remote ? remote.text : await K().getMD(path), "page:" + slug);
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#f-save"); busy(btn, true);
      try {
        await GH.put(path, ed.value.trim() + "\n", `Раздел: ${titles[slug] || slug}`);
        K().S.md[path] = ed.value; K().invalidateSearch(); ed.clearDraft(); done(); location.hash = `#/${slug}`;
      } catch (err) { busy(btn, false); fail(err); }
    };
  }

  const TAGS = ["ДЗ", "Семинар", "Тест", "Экзамен", "ВКР", "НИР", "Мероприятие", "Организационное", "Срочно"];
  function postForm(id) {
    if (needToken()) return;
    const S = K().S;
    const p = id ? S.posts.find((x) => x.id === id) : null;
    if (id && !p) return ($("#main").innerHTML = '<div class="card empty-state">Пост не найден.</div>');
    const authors = ["Староста", "Кафедра", "Учебный отдел"].map((a) => [a, a]).concat(Object.entries(K().SUBJ()).map(([c, s]) => [c, s.short + " · " + s.title]));
    const cur = p || { date: K().iso(K().today()), author: "Староста", tags: [], text: "" };
    const dl = (cur.deadlines || []).map(([d, t]) => `${d} ${t}`).join("\n");
    $("#main").innerHTML = `<form class="card article" id="f"><h1>${p ? "Изменить пост" : "Новый пост"}</h1>
      <div class="ed-grid">
        <label>От кого<select id="f-author" class="ed-input">${authors.map(([v, t]) => `<option value="${esc(v)}"${v === cur.author ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <label>Дата поста<input type="date" id="f-date" class="ed-input" value="${esc(cur.date)}"></label>
        <label>Дедлайн<input type="date" id="f-deadline" class="ed-input" value="${esc(cur.deadline || "")}"></label>
        <label>Ссылка «Подробнее»<input id="f-link" class="ed-input" value="${esc(cur.link || "")}" placeholder="#/hw или https://…"></label>
      </div>
      <div class="chips" id="f-tags" style="margin:12px 0">${TAGS.concat((cur.tags || []).filter((t) => !TAGS.includes(t))).map((t) => `<button type="button" class="chip ${(cur.tags || []).includes(t) ? "blue" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <div class="chips" style="margin-bottom:12px"><label class="chip"><input type="checkbox" id="f-pin" ${cur.pinned ? "checked" : ""}> закрепить</label><label class="chip"><input type="checkbox" id="f-done" ${cur.done ? "checked" : ""}> выполнено / неактуально</label></div>
      ${editorHTML()}
      <details style="margin-top:10px"><summary class="small muted">Несколько дедлайнов в одном посте</summary><textarea id="f-dls" class="ed-input" rows="3" placeholder="2026-11-16 2-й акт&#10;2026-12-16 3-й акт">${esc(dl)}</textarea></details>
      <div class="ed-actions"><button class="tab active" id="f-save">${p ? "Сохранить" : "Опубликовать"}</button><a class="tab" href="#/">Отмена</a>${p ? '<button type="button" class="tab" id="f-del" style="margin-left:auto;color:#C5221F">Удалить</button>' : ""}</div>
    </form>`;
    const ed = mountEditor($(".ed"), cur.text, "post:" + (id || "new"));
    $("#f-tags").onclick = (e) => { const b = e.target.closest("[data-tag]"); if (b) b.classList.toggle("blue"); };
    const save = async (mutate, msg) => {
      const posts = await GH.updateJSON("data/posts.json", (arr) => mutate(arr || []), msg);
      S.posts = posts; K().renderRight(); K().renderLeft();
    };
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const text = ed.value.trim();
      if (!text) return K().toast("Пустой пост");
      const post = {
        id: p ? p.id : `${$("#f-date").value}-${Math.random().toString(36).slice(2, 6)}`,
        date: $("#f-date").value,
        author: $("#f-author").value,
        tags: [...document.querySelectorAll("#f-tags .chip.blue")].map((b) => b.dataset.tag),
        text,
      };
      if ($("#f-deadline").value) post.deadline = $("#f-deadline").value;
      const dls = $("#f-dls").value.split("\n").map((l) => l.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)).filter(Boolean).map((m) => [m[1], m[2]]);
      if (dls.length) post.deadlines = dls;
      if ($("#f-link").value.trim()) post.link = $("#f-link").value.trim();
      if ($("#f-pin").checked) post.pinned = true;
      if ($("#f-done").checked) post.done = true;
      const btn = $("#f-save"); busy(btn, true);
      try {
        await save((arr) => { const i = arr.findIndex((x) => x.id === post.id); i >= 0 ? (arr[i] = post) : arr.unshift(post); return arr; },
          `Пост: ${window.MD.plain(text).slice(0, 60)}`);
        ed.clearDraft(); done(); location.hash = "#/";
      } catch (err) { busy(btn, false); fail(err); }
    };
    if (p) $("#f-del").onclick = async () => {
      if (!confirm("Удалить пост из ленты?")) return;
      try { await save((arr) => arr.filter((x) => x.id !== p.id), `Пост удалён: ${p.id}`); done(); location.hash = "#/"; } catch (err) { fail(err); }
    };
  }

  window.KPIB_EXT = [
    [/^edit\/setup(?:\?(.*))?$/, setup],
    [/^edit\/post$/, () => postForm()],
    [/^edit\/post\/([\w-]+)$/, postForm],
    [/^edit\/lecture$/, () => lectureForm()],
    [/^edit\/lecture\/(\w+)$/, (c) => lectureForm(c)],
    [/^edit\/s\/(\w+)$/, subjectIndexForm],
    [/^edit\/s\/(\w+)\/([\w-]+)$/, lectureForm],
    [/^edit\/page\/(\w+)$/, sectionForm],
  ];

  // Не уходить со страницы с несохранённым текстом
  window.addEventListener("beforeunload", (e) => {
    if (location.hash.startsWith("#/edit/") && !location.hash.startsWith("#/edit/setup") && document.querySelector(".ed-text")?.value) { e.preventDefault(); e.returnValue = ""; }
  });
})();
