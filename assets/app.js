/* Рабочий стол группы 104 КПИБ: одностраничное приложение без сборки.
   Данные: data/*.json и content/**.md. Маршруты через location.hash. */
(function () {
  "use strict";
  const { render: md, inline, esc } = window.MD;
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#main");
  const right = $("#right");
  const S = { md: {} };

  /* ---------- Иконки ---------- */
  const ICON = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M19 19v2H6"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    tg: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l12-9"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
    doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const icon = (n, size = 20) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  /* ---------- Даты ---------- */
  const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const MONF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTH_TITLE = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const parse = (d) => { if (!d) return null; const [y, m, dd] = d.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, dd); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const days = (d) => Math.round((parse(d) - today()) / 864e5);
  const fmt = (d, full) => { const x = parse(d); return x ? `${x.getDate()} ${(full ? MONF : MON)[x.getMonth()]}` : ""; };
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  function rel(d) {
    const n = days(d);
    if (n === 0) return "сегодня";
    if (n === 1) return "завтра";
    if (n === -1) return "вчера";
    if (n > 0) return `через ${n} ${plural(n, "день", "дня", "дней")}`;
    return `${-n} ${plural(-n, "день", "дня", "дней")} назад`;
  }
  const lectureDate = (slug) => {
    const m = slug.match(/(?:^|--)(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = +m[1] >= 8 ? 2026 : 2027;
    return `${y}-${m[1]}-${m[2]}`;
  };

  /* ---------- Хранилище читателя ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("kpib:" + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("kpib:" + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  };
  const toggleIn = (key, id) => {
    const s = new Set(store.get(key, []));
    s.has(id) ? s.delete(id) : s.add(id);
    store.set(key, [...s]);
    return s.has(id);
  };
  const isIn = (key, id) => store.get(key, []).includes(id);

  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------- Загрузка ---------- */
  const getJSON = (p) => fetch(p, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(p)));
  async function getMD(path) {
    if (S.md[path] != null) return S.md[path];
    const r = await fetch(path);
    S.md[path] = r.ok ? await r.text() : "";
    return S.md[path];
  }
  const subjPath = (code, page) => `content/subjects/${code}/${page || "index"}.md`;

  /* ---------- Авторы и аватары ---------- */
  const SUBJ = () => S.schedule.subjects;
  function author(a) {
    const s = SUBJ()[a];
    if (s) return { name: s.title, short: s.short, color: s.color, href: `#/s/${a}`, light: s.color === "#FBBC04" };
    const map = {
      "Учебный отдел": { short: "УО", color: "#4285F4", href: "#/contacts" },
      "Кафедра": { short: "КП", color: "#34A853", href: "#/contacts" },
      "Почта группы": { short: "@", color: "#EA4335", href: "https://e.mail.ru/inbox/" },
      "Староста": { short: "СТ", color: "#202124", href: "#/members" },
    };
    return Object.assign({ name: a, short: a.slice(0, 2).toUpperCase(), color: "#5F6368", href: "#/" }, map[a] || {});
  }
  const avatar = (a, cls = "") =>
    `<span class="avatar ${a.light ? "light" : ""} ${cls}" style="--c:${a.color}">${esc(a.short)}</span>`;
  const initials = (n) => n.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("");
  const PALETTE = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
  const personAvatar = (n, i) => {
    const c = PALETTE[i % 4];
    return `<span class="avatar ${c === "#FBBC04" ? "light" : ""}" style="--c:${c}">${esc(initials(n))}</span>`;
  };

  /* ---------- Расписание ---------- */
  // Официальное расписание ВШГА (tt.audit.msu.ru, обновляется Actions раз в 3 часа)
  const TT_CODES = { "ПТГП": "ptgp", "ИнЯз": "eng", "ПВДИ": "pvdi", "АПИП": "apip", "КРР": "krr", "ИстОП": "iop", "ФилПР": "filpr", "ПРОИ": "proi" };
  const ttCovers = (date) => S.tt && S.tt.from && date >= S.tt.from && date <= S.tt.to;
  const ttLessons = (date) => (S.tt.lessons || []).filter((l) => l.date === date && l.short !== "ВоенКаф").map((l) => ({
    time: `${l.start}–${l.end}`, subject: TT_CODES[l.short] || null, title: l.title, kind: l.kind, room: l.room, teacher: l.teacher, tt: true,
  }));
  function lessonsOn(d) {
    const date = iso(d);
    const sem = S.group.semester;
    if (date < sem.start || date > sem.end) return [];
    const weekly = ttCovers(date) ? ttLessons(date) : S.schedule.weekly[String(d.getDay())] || [];
    const dep = S.schedule.department.find((x) => x.date === date);
    const subj = SUBJ();
    let out = weekly.filter((l) => !(dep && l.subject && subj[l.subject].department));
    if (dep) {
      for (const [code, time, note] of dep.items) {
        const base = weekly.find((l) => l.subject === code && l.time.startsWith(time)) || weekly.find((l) => l.subject === code) || {};
        const room = (note.match(/ауд\.\s*([^\s,]+)/) || [])[1] || base.room || "225А";
        const [h, m] = time.split(":").map(Number);
        const end = new Date(0, 0, 0, h, m + 90);
        out.push({
          time: `${time}–${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
          subject: code, kind: note.replace(/,?\s*ауд\.\s*[^\s,]+/, "") || base.kind || "", room, teacher: base.teacher || "",
        });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }
  function nextStudyDay() {
    const d = today();
    const now = new Date();
    for (let i = 0; i < 21; i++) {
      const x = new Date(d); x.setDate(d.getDate() + i);
      let ls = lessonsOn(x);
      if (i === 0) {
        const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        if (!ls.some((l) => l.time.split("–")[1] > hm)) continue;
      }
      if (ls.length) return { date: x, lessons: ls, offset: i };
    }
    return null;
  }
  function lessonHTML(l, date) {
    const s = SUBJ()[l.subject] || { title: l.title || "Занятие", color: "#9AA0A6" };
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const [a, b] = l.time.split("–");
    const live = date && iso(date) === iso(today()) && hm >= a && hm <= b;
    return `<a class="lesson ${live ? "now" : ""}" href="${l.subject ? `#/s/${l.subject}` : "#/schedule"}" style="--c:${s.color};color:inherit;text-decoration:none">
      <span class="bar"></span>
      <span><b>${esc(s.title)}</b>
      <small><span class="time">${esc(l.time)}</span> · ${esc(l.kind)} · ауд. ${esc(l.room)}${live ? " · идёт сейчас" : ""}</small></span></a>`;
  }

  /* ---------- Дедлайны ---------- */
  function deadlines() {
    const out = [];
    for (const p of S.posts) {
      if (p.done) continue;
      if (p.deadline) out.push({ date: p.deadline, title: MD.plain(p.text).split(/[.:]/)[0].slice(0, 80), sub: author(p.author).name, href: p.link || `#/p/${p.id}` });
      for (const [d, t] of p.deadlines || []) out.push({ date: d, title: t, sub: MD.plain(p.text).split(/[.:]/)[0].slice(0, 60), href: p.link || `#/p/${p.id}` });
    }
    for (const e of S.events) {
      if (e.deadline && e.status !== "Подала") out.push({ date: e.deadline, title: "Заявка: " + e.title, sub: `${e.type || ""} · ${e.points || "?"} б.`, href: "#/events", event: true });
    }
    return out.filter((x) => days(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  }
  const dlHTML = (x) => {
    const d = parse(x.date);
    return `<a class="dl ${days(x.date) <= 3 ? "hot" : ""}" href="${x.href}">
      <span class="when"><b>${d.getDate()}</b><span>${MON[d.getMonth()]}</span></span>
      <span class="what">${esc(x.title)}<small>${esc(rel(x.date))} · ${esc(x.sub)}</small></span></a>`;
  };

  /* ---------- Правая колонка ---------- */
  function renderRight() {
    const nd = nextStudyDay();
    let day = '<div class="muted small">Занятий в ближайшие дни нет.</div>';
    if (nd) {
      const label = nd.offset === 0 ? "Сегодня" : nd.offset === 1 ? "Завтра" : WD[nd.date.getDay()].replace(/^./, (c) => c.toUpperCase());
      day = `<div class="day-title">${label}, ${nd.date.getDate()} ${MONF[nd.date.getMonth()]}</div>` + nd.lessons.map((l) => lessonHTML(l, nd.date)).join("");
    }
    const dl = deadlines();
    const tgItems = (S.tg.items || []).slice(0, 3);
    right.innerHTML = `
      <section class="card widget"><h3>${icon("tg", 18)} Компы Важное <a href="#/feed/tg">Все</a></h3>
        ${tgItems.length ? tgItems.map((t) => `<a class="chat" href="#/feed/tg" style="align-items:flex-start"><span class="what small" style="line-height:1.35"><b style="font-weight:400">${esc(MD.plain(t.text || "Фото").slice(0, 110))}${(t.text || "").length > 110 ? "…" : ""}</b><small>${esc(fmt(t.date))}, ${esc((t.date || "").slice(11, 16))}</small></span></a>`).join("")
          : `<div class="small muted">Свежие посты канала появятся здесь после подключения бота. <a href="${esc(S.group.channel.url)}" target="_blank" rel="noopener">Открыть канал</a></div>`}</section>
      <section class="card widget"><h3>${icon("clock", 18)} Пары <a href="#/schedule">Расписание</a></h3>${day}</section>
      <section class="card widget"><h3>${icon("check", 18)} Дедлайны <a href="#/events">Все</a></h3>
        ${dl.length ? dl.slice(0, 6).map(dlHTML).join("") : '<div class="muted small">Ближайших дедлайнов нет.</div>'}</section>
      <section class="card widget"><h3>${icon("mail", 18)} Почта группы <a href="${S.group.mail.web}" target="_blank" rel="noopener">Открыть</a></h3><div class="small muted">${esc(S.group.mail.address)}</div></section>
      <section class="card widget"><h3>${icon("tg", 18)} Беседы</h3>
        ${S.group.chats.map((c) => `<a class="chat" href="${c.url}" target="_blank" rel="noopener">${appAvatar(c.app)}<span><b>${esc(c.title)}</b><small>${esc(c.app)}</small></span></a>`).join("")}
        <a class="chat" href="${S.group.video.url}" target="_blank" rel="noopener"><span class="avatar" style="--c:#202124">${icon("video", 16)}</span><span><b>${esc(S.group.video.title)}</b><small>ВКС</small></span></a>
      </section>
      <section class="card widget linklist"><h3>${icon("link", 18)} Ссылки</h3>
        ${S.group.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join("")}</section>`;
  }
  function appAvatar(app) {
    const m = { Telegram: ["TG", "#4285F4"], MAX: ["MX", "#202124"], WhatsApp: ["WA", "#34A853"], "ВКонтакте": ["VK", "#4285F4"] }[app] || ["•", "#5F6368"];
    return `<span class="avatar" style="--c:${m[1]}">${m[0]}</span>`;
  }

  /* ---------- Посты ---------- */
  function feedItems() {
    const items = [];
    for (const p of S.posts) items.push({ kind: "post", id: "p:" + p.id, date: p.date, data: p });
    for (const t of S.tg.items || []) items.push({ kind: "tg", id: "t:" + t.id, date: (t.date || "").slice(0, 10), stamp: t.date, data: t });
    for (const s of S.tree.subjects) {
      for (const pg of s.pages) {
        const d = lectureDate(pg.slug);
        if (!pg.lecture || pg.empty || !d) continue;
        items.push({ kind: "lecture", id: `l:${s.code}/${pg.slug}`, date: d, data: { subject: s.code, page: pg } });
      }
    }
    items.sort((a, b) => (b.data.pinned ? 1 : 0) - (a.data.pinned ? 1 : 0) || b.date.localeCompare(a.date) || (b.stamp || "").localeCompare(a.stamp || ""));
    return items;
  }

  function actions(id, href, editHref) {
    const liked = isIn("likes", id), saved = isIn("saved", id);
    return `<div class="post-actions">
      <button class="act ${liked ? "on" : ""}" data-like="${esc(id)}">${icon("heart", 18)} Полезно</button>
      <button class="act save ${saved ? "on" : ""}" data-save="${esc(id)}">${icon("save", 18)} ${saved ? "Сохранено" : "Сохранить"}</button>
      ${editHref ? `<a class="act right" href="${editHref}">Изменить</a>` : ""}
      <button class="act ${editHref ? "" : "right"}" data-share="${esc(href)}">${icon("share", 18)}</button></div>`;
  }

  function postHTML(it) {
    if (it.kind === "lecture") {
      const s = SUBJ()[it.data.subject], pg = it.data.page;
      const a = author(it.data.subject);
      const href = `#/s/${it.data.subject}/${pg.slug}`;
      const mins = Math.max(1, Math.round(pg.chars / 1500));
      return `<article class="card post">
        <header class="post-head">${avatar(a)}<div><a class="post-author" href="${a.href}">${esc(s.title)}</a>
        <div class="post-sub">Конспект · ${esc(fmt(it.date, true))}</div></div></header>
        <div class="post-body"><p><strong><a href="${href}" style="color:inherit">${esc(pg.title)}</a></strong></p>
        <p class="excerpt">${esc(pg.excerpt || "")}</p></div>
        <div class="chips"><span class="chip">${icon("book", 14)} ${mins} мин чтения</span><a class="chip blue" href="${href}">Читать конспект</a></div>
        ${actions(it.id, href)}</article>`;
    }
    if (it.kind === "tg") {
      const t = it.data;
      const photos = [t.photo, ...(t.photos || [])].filter(Boolean);
      const time = t.date ? t.date.slice(11, 16) : "";
      return `<article class="card post tgpost">
        <header class="post-head"><span class="avatar" style="--c:#4285F4">${icon("tg", 18)}</span><div><a class="post-author" href="${esc(S.group.channel.url)}" target="_blank" rel="noopener">${esc(t.channel || S.group.channel.title)}</a>
        <div class="post-sub">Telegram-канал · ${esc(fmt(t.date, true))}${time ? ", " + time : ""}${t.edited ? " · изменено" : ""}</div></div></header>
        ${photos.length ? `<div class="tg-photos n${Math.min(photos.length, 4)}">${photos.slice(0, 4).map((p) => `<img loading="lazy" src="${esc(p)}" alt="">`).join("")}</div>` : ""}
        <div class="post-body md">${md(t.text || "")}</div>
        ${t.files ? `<div class="chips">${t.files.map((f) => `<a class="chip" href="${esc(t.url)}" target="_blank" rel="noopener">${icon("doc", 14)} ${esc(f)}</a>`).join("")}</div>` : ""}
        <div class="chips"><a class="chip blue" href="${esc(t.url)}" target="_blank" rel="noopener">Открыть в Telegram</a></div>
        ${actions(it.id, "#/feed/tg")}</article>`;
    }
    const p = it.data;
    const a = author(p.author);
    const chips = [];
    for (const t of p.tags || []) chips.push(`<span class="chip">${esc(t)}</span>`);
    if (p.done) chips.push('<span class="chip green">Выполнено</span>');
    else if (p.deadline) {
      const n = days(p.deadline);
      chips.push(`<span class="chip ${n < 0 ? "" : n <= 3 ? "red" : n <= 10 ? "yellow" : "blue"}">${icon("clock", 14)} до ${esc(fmt(p.deadline))}, ${esc(rel(p.deadline))}</span>`);
    }
    for (const [d, t] of p.deadlines || []) {
      const n = days(d);
      chips.push(`<span class="chip ${n < 0 ? "" : n <= 3 ? "red" : n <= 10 ? "yellow" : "blue"}">${esc(t)}: ${esc(fmt(d))}</span>`);
    }
    if (p.link) chips.push(`<a class="chip blue" href="${p.link}">Подробнее</a>`);
    return `<article class="card post ${p.pinned ? "pinned" : ""} ${p.done ? "done" : ""}">
      <header class="post-head">${avatar(a)}<div><a class="post-author" href="${a.href}">${esc(a.name)}</a>
      <div class="post-sub">${p.pinned ? '<span class="pin">Закреплено</span> · ' : ""}${esc(fmt(p.date, true))}</div></div></header>
      <div class="post-body md">${md(p.text)}</div>
      <div class="chips">${chips.join("")}</div>
      ${actions(it.id, `#/p/${p.id}`)}</article>`;
  }

  function upcomingEventsPost() {
    const ev = S.events.filter((e) => e.fit === "Подходит" && (days(e.deadline || e.date || "2000-01-01") >= 0)).slice(0, 5);
    if (!ev.length) return "";
    return `<article class="card post">
      <header class="post-head">${avatar(author("Кафедра"))}<div><a class="post-author" href="#/events">Конференции и конкурсы</a>
      <div class="post-sub">Подборка по темам дисциплин</div></div></header>
      <div class="post-body">${ev.map(eventHTML).join("")}</div>
      <div class="chips"><a class="chip blue" href="#/events">Все мероприятия (${S.events.length})</a></div></article>`;
  }

  /* ---------- Маршрутизатор ---------- */
  const routes = [
    [/^$/, feed],
    [/^feed\/(\w+)$/, feed],
    [/^saved$/, saved],
    [/^schedule$/, schedule],
    [/^subjects$/, subjects],
    [/^s\/(\w+)$/, community],
    [/^s\/(\w+)\/([\w-]+)$/, article],
    [/^events$/, events],
    [/^calc(?:\?(.*))?$/, calc],
    [/^members$/, members],
    [/^m\/(\d+)$/, member],
    [/^contacts$/, contacts],
    [/^p\/([\w-]+)$/, postOne],
    [/^(hw|brs|vkr|about)$/, page],
  ];
  const STANDALONE = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (STANDALONE) document.documentElement.classList.add("standalone");
  let depth = 0;
  window.addEventListener("hashchange", () => depth++);
  document.getElementById("back-btn").onclick = () => (depth > 0 ? (depth -= 2, history.back()) : (location.hash = "#/"));
  async function route() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    document.getElementById("back-btn").classList.toggle("show", h !== "");
    document.querySelector(".layout").classList.toggle("wide", /^calc/.test(h));
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const n = a.getAttribute("data-nav");
      a.classList.toggle("active", n === "" ? h === "" || h.startsWith("feed") : h === n || h.startsWith(n + "/"));
    });
    for (const [rx, fn] of routes.concat(window.KPIB_EXT || [])) {
      const m = h.match(rx);
      if (m) {
        window.scrollTo(0, 0);
        $("#progress").style.width = "0";
        await fn(...m.slice(1));
        bindActions();
        return;
      }
    }
    app.innerHTML = `<div class="card empty-state">Страница не найдена. <a href="#/">На главную</a></div>`;
  }

  /* ---------- Страницы ---------- */
  function feed(filter = "all") {
    const g = S.group;
    const lecturesCount = S.tree.subjects.reduce((n, s) => n + s.pages.filter((p) => p.lecture && !p.empty).length, 0);
    const tabs = [["all", "Все"], ["tg", "Компы Важное"], ["news", "Объявления"], ["hw", "ДЗ"], ["lectures", "Конспекты"]];
    let items = feedItems();
    if (filter === "news") items = items.filter((i) => i.kind === "post");
    if (filter === "hw") items = items.filter((i) => i.kind === "post" && (i.data.tags || []).includes("ДЗ"));
    if (filter === "lectures") items = items.filter((i) => i.kind === "lecture");
    if (filter === "tg") items = items.filter((i) => i.kind === "tg");
    const limit = 12;
    const subj = SUBJ();
    app.innerHTML = `
      <section class="card cover">
        <div class="cover-band"><i></i><i></i><i></i><i></i></div>
        <div class="cover-body"><div class="avatar-xl">104</div>
          <div class="cover-meta"><h1>${esc(g.fullName)}</h1>
          <div class="muted">${esc(g.program)} · ${esc(g.level)}</div>
          <div class="muted small">${esc(g.faculty)}, ${esc(g.university)}</div></div></div>
        <div class="stats">
          <a href="#/members"><b>${g.students.length}</b><span>участников</span></a>
          <a href="#/subjects"><b>${Object.keys(subj).length}</b><span>дисциплин</span></a>
          <a href="#/feed/lectures"><b>${lecturesCount}</b><span>конспектов</span></a>
          <a href="#/events"><b>${S.events.length}</b><span>мероприятий</span></a>
          <a href="#/schedule"><b>${semesterWeek()}</b><span>неделя из ${g.semester.weeks}</span></a>
        </div>
      </section>
      <section class="card stories" aria-label="Дисциплины">
        ${Object.entries(subj).map(([c, s]) => `<a class="story" href="#/s/${c}" style="--c:${s.color}"><div class="ring"><span>${esc(s.short)}</span></div><span class="lbl">${esc(s.title)}</span></a>`).join("")}
      </section>
      <div class="right inline" id="right-inline"></div>
      <nav class="tabs">${tabs.map(([k, t]) => `<a class="tab ${k === filter ? "active" : ""}" href="#/${k === "all" ? "" : "feed/" + k}">${t}</a>`).join("")}</nav>
      <div id="feed"></div>`;
    const box = $("#feed");
    let shown = 0;
    const more = () => {
      const chunk = items.slice(shown, shown + limit);
      let html = chunk.map(postHTML).join("");
      if (shown === 0 && filter === "all") {
        const i = Math.min(2, chunk.length);
        const parts = chunk.map(postHTML);
        parts.splice(i, 0, upcomingEventsPost());
        html = parts.join("");
      }
      shown += chunk.length;
      $("#more")?.remove();
      box.insertAdjacentHTML("beforeend", html + (shown < items.length ? `<button id="more" class="tab" style="display:block;margin:0 auto 20px">Показать ещё</button>` : ""));
      if (!items.length) box.innerHTML = `<div class="card empty-state">${filter === "tg" ? tgSetupHint() : "Здесь пока пусто."}</div>`;
      $("#more")?.addEventListener("click", () => { more(); bindActions(); });
    };
    more();
    if (window.matchMedia("(max-width: 1100px)").matches) {
      const nd = nextStudyDay();
      const dl = deadlines().slice(0, 3);
      $("#right-inline").innerHTML = (nd ? `<section class="card widget"><h3>${icon("clock", 18)} ${nd.offset === 0 ? "Сегодня" : nd.offset === 1 ? "Завтра" : WD[nd.date.getDay()].replace(/^./, (c) => c.toUpperCase())}, ${nd.date.getDate()} ${MONF[nd.date.getMonth()]} <a href="#/schedule">Расписание</a></h3>${nd.lessons.map((l) => lessonHTML(l, nd.date)).join("")}</section>` : "") +
        (dl.length ? `<section class="card widget"><h3>${icon("check", 18)} Дедлайны <a href="#/events">Все</a></h3>${dl.map(dlHTML).join("")}</section>` : "");
    }
  }

  function semesterWeek() {
    const s = parse(S.group.semester.start);
    const n = Math.floor((today() - s) / (7 * 864e5)) + 1;
    return Math.max(1, Math.min(S.group.semester.weeks, n));
  }

  function saved() {
    const ids = new Set(store.get("saved", []));
    const items = feedItems().filter((i) => ids.has(i.id));
    app.innerHTML = `<h2 style="margin:4px 0 14px">Сохранённое</h2>` +
      (items.length ? items.map(postHTML).join("") : `<div class="card empty-state">Нажмите «Сохранить» под постом или конспектом, и он появится здесь. Список хранится в этом браузере.</div>`);
  }

  function postOne(id) {
    const p = S.posts.find((x) => x.id === id);
    app.innerHTML = p ? postHTML({ kind: "post", id: "p:" + id, date: p.date, data: p }) : `<div class="card empty-state">Пост не найден.</div>`;
  }

  function schedule() {
    const subj = SUBJ();
    const day = (n, title) => `<section class="card"><h3>${title}</h3>${S.schedule.weekly[n].map((l) => lessonHTML(l)).join("")}</section>`;
    const t = iso(today());
    let cur = S.schedule.department.findIndex((x) => x.date >= t);
    const rows = S.schedule.department.map((r, i) => {
      const cls = r.date < t ? "past" : i === cur || i === cur + 1 ? "current" : "";
      const d = parse(r.date);
      return `<tr class="${cls}"><td><b>${fmt(r.date)}</b><br><small class="muted">${WD[d.getDay()]}</small></td><td>${
        r.items.length ? r.items.map(([c, time, note]) => `<span class="chip" style="background:${subj[c].color}22;color:var(--text)">${esc(time)} ${esc(subj[c].short)}</span> ${esc(note)}`).join("<br>") : '<span class="faint">занятий кафедры нет</span>'}</td></tr>`;
    }).join("");
    app.innerHTML = `<h2 style="margin:4px 0 6px">Расписание</h2>
      <p class="muted" style="margin:0 0 14px">${esc(S.group.semester.title)}: ${fmt(S.group.semester.start, true)} – ${fmt(S.group.semester.end, true)}, ${S.group.semester.weeks} учебных недель. Сейчас ${semesterWeek()}-я неделя.</p>
      ${ttCard()}
      <div class="week">${day("2", "Вторник")}${day("5", "Пятница")}</div>
      <section class="card"><h3>Занятия кафедры по неделям</h3><p class="muted small">${esc(S.schedule.departmentNote)}</p>
        <div class="table-scroll"><table class="grid-table"><thead><tr><th>Дата</th><th>Занятия</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section class="card"><a href="${S.group.links[2].url}" target="_blank" rel="noopener">Таблица расписания в Google</a></section>`;
  }

  function ttCard() {
    if (!S.tt || !(S.tt.lessons || []).length) return "";
    const t0 = iso(today());
    const dates = [...new Set(S.tt.lessons.filter((l) => l.date >= t0 && l.short !== "ВоенКаф").map((l) => l.date))].slice(0, 8);
    const upd = S.tt.updated ? new Date(S.tt.updated).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
    return `<section class="card"><h3 style="display:flex;align-items:center">Ближайшие занятия <a class="tab" style="margin-left:auto;font-size:13px" href="${esc(S.tt.source)}" target="_blank" rel="noopener">tt.audit.msu.ru</a></h3>
      <p class="muted small">По официальному расписанию ВШГА${upd ? `, обновлено ${esc(upd)}` : ""}. Отмены и переносы из канала учтены. Военная кафедра (понедельник) не показана.</p>
      ${dates.map((d) => { const x = parse(d); return `<div class="day-title">${WD[x.getDay()].replace(/^./, (c) => c.toUpperCase())}, ${x.getDate()} ${MONF[x.getMonth()]}</div>` + (lessonsOn(x).map((l) => lessonHTML(l, x)).join("") || '<div class="muted small">занятий нет</div>'); }).join("")}</section>`;
  }

  function subjects() {
    const subj = SUBJ();
    const card = ([c, s]) => {
      const t = S.tree.subjects.find((x) => x.code === c);
      const n = t ? t.pages.filter((p) => p.lecture && !p.empty).length : 0;
      return `<a class="card" href="#/s/${c}" style="display:flex;gap:14px;align-items:center;color:inherit;text-decoration:none;margin:0">
        ${avatar(author(c))}<span><b>${esc(s.title)}</b><br><small class="muted">${esc(s.teacher)} · ${esc(s.exam)} · ${n} ${plural(n, "конспект", "конспекта", "конспектов")}</small></span></a>`;
    };
    const ex = Object.entries(subj).filter(([, s]) => s.exam === "Экзамен");
    const cr = Object.entries(subj).filter(([, s]) => s.exam !== "Экзамен");
    app.innerHTML = `<h2 style="margin:4px 0 14px">Дисциплины</h2>
      <div class="month">Экзамены</div><div style="display:grid;gap:10px">${ex.map(card).join("")}</div>
      <div class="month" style="margin-top:22px">Зачёты</div><div style="display:grid;gap:10px">${cr.map(card).join("")}</div>
      <section class="card" style="margin-top:16px" id="plan"></section>`;
    getMD("content/pages/subjects.md").then((t) => {
      const i = t.indexOf("## Учебный план");
      $("#plan").innerHTML = '<div class="md">' + md(i >= 0 ? t.slice(i) : "") + "</div>";
    });
  }

  const LEGEND = `<div class="legend"><span><mark class="hl-yellow">определения</mark></span><span><b>термины</b></span><span><mark class="hl-green">выводы, к экзамену</mark></span><span><mark class="hl-blue">даты, документы, НПА</mark></span><span><mark class="hl-purple">авторы</mark></span><span><mark class="hl-cyan">авторские акценты</mark></span><span><i>цитаты, примеры</i></span></div>`;

  async function community(code) {
    const s = SUBJ()[code], t = S.tree.subjects.find((x) => x.code === code);
    if (!s || !t) return (app.innerHTML = '<div class="card empty-state">Дисциплина не найдена.</div>');
    const weekly = Object.entries(S.schedule.weekly).flatMap(([d, ls]) => ls.filter((l) => l.subject === code).map((l) => `${WD[+d]}, ${l.time}, ${l.kind.toLowerCase()}, ауд. ${l.room}`));
    const lectures = t.pages.filter((p) => p.lecture);
    const other = t.pages.filter((p) => !p.lecture && p.depth === 0);
    const sub = t.pages.filter((p) => !p.lecture && p.depth > 0);
    const byMonth = {};
    for (const p of lectures.concat(sub)) {
      const d = lectureDate(p.slug);
      const k = d ? MONTH_TITLE[parse(d).getMonth()] : "Прочее";
      (byMonth[k] = byMonth[k] || []).push(p);
    }
    const lec = (p) => {
      const href = `#/s/${code}/${p.slug}`;
      if (p.empty) return `<div class="lec empty"><b>${esc(p.title.replace(/^Лекция от /i, ""))}</b><small>конспекта пока нет</small></div>`;
      return `<a class="lec" href="${href}" style="--c:${s.color}"><b>${esc(p.title.replace(/^Лекция от /i, ""))}</b><small>${esc(p.lecture ? "Лекция" : p.title)}</small><span class="chip tag">${Math.max(1, Math.round(p.chars / 1500))} мин</span></a>`;
    };
    const rating = t.pages.find((p) => p.slug === "reyting");
    app.innerHTML = `
      <section class="card community-head" style="--c:${s.color}"><div class="band"></div>
        <div class="cover-body"><div class="avatar-xl">${esc(s.short)}</div>
        <div class="cover-meta"><h1>${esc(s.title)}</h1><div class="muted">${esc(s.teacher)}</div></div></div>
        <div class="facts">
          <div class="fact"><small>Когда</small><b>${weekly.map(esc).join("<br>") || "по расписанию"}</b></div>
          <div class="fact"><small>Часы</small><b>${esc(s.hours)}</b></div>
          <div class="fact"><small>Итог</small><b>${esc(s.exam)}</b></div>
          ${s.department ? '<div class="fact"><small>БРС</small><b>кафедральная дисциплина</b></div>' : ""}
        </div></section>
      ${other.length ? `<section class="card"><h3>Материалы</h3><div class="lectures">${other.map((p) => `<a class="lec" href="#/s/${code}/${p.slug}" style="--c:${s.color}"><b>${esc(p.title)}</b><small>${p.slug === "reyting" ? "баллы по занятиям" : "страница"}</small></a>`).join("")}</div></section>` : ""}
      ${`<section class="card"><h3 style="display:flex;align-items:center">Конспекты ${editBtn((S.tree.subjects.find((x) => x.code === code) || {}).id || (S.tree.sections.find((x) => x.slug === "subjects") || {}).id, "+ Новая лекция в Craft", "margin-left:auto;font-size:13px")}</h3>${Object.keys(byMonth).length ? "" : '<p class="muted small">Конспектов пока нет.</p>'}${Object.entries(byMonth).map(([m, ps]) => `<div class="month">${m}</div><div class="lectures">${ps.map(lec).join("")}</div>`).join("")}${lectures.length ? LEGEND : ""}</section>`}
      ${rating ? `<section class="card"><h3>Мои баллы</h3><div id="myscore" class="small muted">Выберите себя в разделе <a href="#/members">Участники</a>, чтобы видеть свой рейтинг здесь.</div></section>` : ""}
      <section class="card article" id="about"><h3 style="display:flex;align-items:center">О дисциплине ${editBtn((S.tree.subjects.find((x) => x.code === code) || {}).id || (S.tree.sections.find((x) => x.slug === "subjects") || {}).id, "", "margin-left:auto;font-size:13px")}</h3><div class="md"></div></section>`;
    const txt = await getMD(subjPath(code));
    const cleaned = txt.split("\n").filter((l) => !/^- \[.*\]\(#\/s\//.test(l) && !/^\*\*(Преподавател|Когда|Часы)/.test(l)).join("\n")
      .replace(/<div class="callout" markdown>\s*\*\*Как читать выделения:\*\*[\s\S]*?Курсивом[^\n]*\n\s*<\/div>/, "")
      .replace(/(<div class="callout" markdown>\s*-[^\n]*\n\s*<\/div>\s*)+/g, (m) => /Жёлтым|Жирным|Зелёным|Синим|Фиолетовым|Голубым|Курсивом/.test(m) ? "" : m)
      .replace(/^#{1,3} (СЕНТЯБРЬ|ОКТЯБРЬ|НОЯБРЬ|ДЕКАБРЬ)\s*$/gm, "").replace(/^\*{6}$/gm, "");
    const html = md(cleaned).trim();
    $("#about .md").innerHTML = html.replace(/<[^>]+>/g, "").trim() ? html : '<p class="muted small">Здесь можно разместить файлы, ссылки и правила курса.</p>';
    const me = store.get("me", null);
    if (rating && me != null) {
      const sc = await scoresFor(S.group.students[me]);
      const r = sc.find((x) => x.code === code);
      if (r) $("#myscore").outerHTML = scoreRow(r);
    }
  }

  const CRAFT = "https://docs.craft.do/editor/d/70742663-529e-cbfb-eeac-060330bf3840/8767ab27-1590-c70c-0a1d-f5192a041a7e/x/";
  // Страницы из Craft редактируются в Craft: правка на сайте затёрлась бы ближайшей синхронизацией
  const editBtn = (craftId, label, style = "") =>
    `<a class="tab" style="${style}" href="${CRAFT}${craftId || S.tree.craftId}" target="_blank" rel="noopener">${label || "Редактировать в Craft"}</a>`;

  // Выгрузка в PDF и Word (assets/export.js)
  const exportBtns = () => `<button class="tab" data-export="pdf" title="Сохранить как PDF">PDF</button><button class="tab" data-export="docx" title="Скачать .docx">Word</button>`;
  const initialsOf = (n) => (n || "").replace(/\./g, " ").split(/\s+/).filter(Boolean).slice(0, 3).map((x) => x[0].toUpperCase()).join("");
  function bindExport(meta) {
    app.querySelectorAll("[data-export]").forEach((b) => (b.onclick = async () => {
      const html = $("#body").innerHTML;
      try {
        b.disabled = true;
        await window.KPIBExport[b.dataset.export === "pdf" ? "pdf" : "docx"](meta, html);
      } catch (e) { toast("Не получилось: " + e.message); }
      b.disabled = false;
    }));
  }

  async function article(code, slug) {
    const s = SUBJ()[code], t = S.tree.subjects.find((x) => x.code === code);
    const pg = t && t.pages.find((p) => p.slug === slug);
    if (!pg) return (app.innerHTML = '<div class="card empty-state">Страница не найдена.</div>');
    const list = t.pages.filter((p) => p.lecture && !p.empty);
    const idx = list.indexOf(pg);
    const prev = idx > 0 ? list[idx - 1] : null, next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
    app.innerHTML = `<div class="crumbs" style="display:flex;gap:8px;align-items:center"><span><a href="#/subjects">Дисциплины</a> / <a href="#/s/${code}">${esc(s.title)}</a></span><span style="margin-left:auto;display:flex;gap:6px">${exportBtns()}${editBtn(pg.id || (t.id), "")}</span></div>
      <article class="card article"><header class="post-head">${avatar(author(code))}<div><a class="post-author" href="#/s/${code}">${esc(s.title)}</a><div class="post-sub">${esc(s.teacher)}${lectureDate(slug) ? " · " + fmt(lectureDate(slug), true) : ""}</div></div></header>
      <h1>${esc(pg.title)}</h1>${pg.lecture ? LEGEND : ""}<div class="md ${pg.lecture ? "reading" : ""}" id="body"><p class="muted">Загрузка…</p></div>
      ${actions(`l:${code}/${slug}`, `#/s/${code}/${slug}`)}</article>
      <nav class="pager">${prev ? `<a href="#/s/${code}/${prev.slug}"><small>← Предыдущая</small>${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="next" href="#/s/${code}/${next.slug}"><small>Следующая →</small>${esc(next.title)}</a>` : "<span></span>"}</nav>`;
    const txt = await getMD(subjPath(code, slug));
    $("#body").innerHTML = md(txt) || '<p class="muted">Пусто.</p>';
    const ld = lectureDate(slug);
    bindExport({ what: s.short, who: initialsOf(s.teacher) || "104КПИБ", date: ld ? parse(ld) : new Date(), title: pg.title,
      sub: [s.title, s.teacher, ld ? fmt(ld, true) : ""].filter(Boolean).join(" · ") });
    bindActions();
    store.set("read", [...new Set([...store.get("read", []), `${code}/${slug}`])]);
  }

  async function page(slug) {
    const titles = { hw: "Домашние задания", brs: "Баллы (БРС)", vkr: "ВКР", about: "Рабочий стол в Craft" };
    const file = slug === "about" ? "home" : slug;
    app.innerHTML = `<article class="card article"><div style="display:flex;gap:8px;align-items:start"><h1 style="flex:1">${titles[slug]}</h1>${exportBtns()}${editBtn(slug === "about" ? S.tree.craftId : (S.tree.sections.find((x) => x.slug === slug) || {}).id)}</div><div class="md" id="body"><p class="muted">Загрузка…</p></div></article>`;
    let t = await getMD(`content/pages/${file}.md`);
    if (slug === "about") t = t.split("\n").filter((l) => !/^- \[[^\]]+\]\(#\//.test(l)).join("\n");
    $("#body").innerHTML = md(t);
    bindExport({ what: { hw: "ДЗ", brs: "БРС", vkr: "ВКР", about: "Рабочий стол" }[slug], who: "104КПИБ", date: new Date(), title: titles[slug], sub: "Группа 104 КПИБ · ВШГА МГУ" });
    if (slug === "brs") $("#body").insertAdjacentHTML("afterbegin", `<p><a class="chip blue" href="#/calc">Калькулятор БРС: журнал, заявки, прогноз</a> <a class="chip" href="#/members">Баллы по таблицам рейтинга</a></p>`);
  }

  function eventHTML(e) {
    const d = e.date || e.deadline;
    const x = parse(d);
    const past = d && days(e.date || e.deadline) < 0;
    const fitColor = { "Подходит": "green", "Спорно": "yellow", "Не подходит": "red" }[e.fit] || "";
    return `<div class="event ${past ? "past" : ""}">
      <div class="when">${x ? `<b>${x.getDate()}</b><span>${MON[x.getMonth()]}</span>` : "<b>?</b><span>дата</span>"}</div>
      <div><b>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener" style="color:inherit">${esc(e.title)}</a>` : esc(e.title)}</b>
        <div class="chips">${e.type ? `<span class="chip">${esc(e.type)}</span>` : ""}${e.format ? `<span class="chip">${esc(e.format)}</span>` : ""}${e.role ? `<span class="chip">${esc(e.role)}</span>` : ""}${e.fit ? `<span class="chip ${fitColor}">${esc(e.fit)}</span>` : ""}${(e.subjects || []).map((c) => `<span class="chip blue">${esc(c)}</span>`).join("")}${e.certificate === "Да" ? '<span class="chip green">сертификат</span>' : ""}</div>
        ${e.deadline ? `<small class="${days(e.deadline) >= 0 && days(e.deadline) <= 5 ? "" : "muted"}" style="${days(e.deadline) >= 0 && days(e.deadline) <= 5 ? "color:#C5221F" : ""}">Заявка до ${fmt(e.deadline, true)} (${rel(e.deadline)})</small>` : ""}</div>
      <div class="pts">${e.points ?? "?"}<small>баллов</small></div></div>`;
  }

  /* ---------- Калькулятор БРС (бывший brs-kpib.tatnet.app) ---------- */
  function calc(q) {
    const imp = /import=([^&]+)/.exec(q || "");
    app.innerHTML = `<div class="calc-head"><h2 style="margin:4px 0">Баллы БРС</h2>
      <span class="chips"><a class="chip" href="#/brs">Правила БРС</a><a class="chip" href="brs/events.html">Мероприятия для баллов</a><a class="chip" href="brs/" target="_blank" rel="noopener">Открыть отдельно</a></span></div>
      <iframe class="calc-frame" id="calc-frame" title="Калькулятор БРС" src="brs/${imp ? "#import=" + imp[1] : ""}"></iframe>`;
    const fit = () => { const f = $("#calc-frame"); if (!f) return removeEventListener("resize", fit);
      const top = f.getBoundingClientRect().top + scrollY, nav = $(".bottom-nav"), b = nav && getComputedStyle(nav).display !== "none" ? nav.offsetHeight : 0;
      f.style.height = Math.max(420, innerHeight - top - b - 12) + "px"; };
    fit(); addEventListener("resize", fit);
    if (imp) history.replaceState(null, "", "#/calc");
  }

  function events() {
    const subjects = [...new Set(S.events.flatMap((e) => e.subjects || []))].sort();
    const f = store.get("evf", { fit: "", subj: "", future: true });
    app.innerHTML = `<h2 style="margin:4px 0 6px">Конференции, конкурсы и НИР</h2>
      <section class="card md" id="nir"></section>
      <div class="filters">
        <select id="f-fit"><option value="">Любой профиль</option><option>Подходит</option><option>Спорно</option></select>
        <select id="f-subj"><option value="">Все дисциплины</option>${subjects.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
        <label><input type="checkbox" id="f-future"> только предстоящие</label>
        <a class="tab" href="https://forms.gle/okaXJsUk3cUDrYRh7" target="_blank" rel="noopener">Форма участия</a>
        <a class="tab" href="brs/events.html">Подборка с фильтрами</a>
      </div>
      <section class="card" id="ev"></section>`;
    getMD("content/pages/events.md").then((t) => {
      $("#nir").innerHTML = md(t.split("[[events-table]]")[0]);
    });
    const draw = () => {
      const list = S.events.filter((e) => (!f.fit || e.fit === f.fit) && (!f.subj || (e.subjects || []).includes(f.subj)) &&
        (!f.future || days(e.deadline || e.date || "2999-01-01") >= 0));
      $("#ev").innerHTML = list.length ? list.map(eventHTML).join("") : '<div class="empty-state">Ничего не найдено.</div>';
      store.set("evf", f);
    };
    $("#f-fit").value = f.fit; $("#f-subj").value = f.subj; $("#f-future").checked = f.future;
    $("#f-fit").onchange = (e) => { f.fit = e.target.value; draw(); };
    $("#f-subj").onchange = (e) => { f.subj = e.target.value; draw(); };
    $("#f-future").onchange = (e) => { f.future = e.target.checked; draw(); };
    draw();
  }

  function members() {
    const me = store.get("me", null);
    app.innerHTML = `<h2 style="margin:4px 0 6px">Участники</h2><p class="muted" style="margin:0 0 14px">${S.group.students.length} человек. Откройте свою страницу и нажмите «Это я», чтобы видеть свои баллы в дисциплинах.</p>
      <div class="members">${S.group.students.map((n, i) => `<a class="member" href="#/m/${i}">${personAvatar(n, i)}<b>${esc(n)}</b>${me === i ? '<small class="chip blue">это вы</small>' : ""}</a>`).join("")}</div>`;
  }

  async function scoresFor(name) {
    const surname = name.split(" ")[0];
    const out = [];
    for (const t of S.tree.subjects) {
      const pg = t.pages.find((p) => p.slug === "reyting");
      if (!pg) continue;
      const txt = await getMD(subjPath(t.code, "reyting"));
      let total = 0, present = 0, missed = 0, extra = 0;
      for (const block of txt.split(/^## /m)) {
        const lines = block.split("\n").filter((l) => l.trim().startsWith("|"));
        if (lines.length < 3) continue;
        const head = lines[0].split("|").slice(1, -1).map((c) => c.replace(/\*/g, "").trim());
        const row = lines.find((l) => new RegExp("^\\|\\s*\\d+\\s+" + surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)").test(l.trim()));
        if (!row) continue;
        const cells = row.split("|").slice(1, -1).map((c) => c.trim());
        cells.forEach((c, i) => {
          if (i === 0 || /^=/.test(c) || /ИТОГО/i.test(head[i] || "")) return;
          const v = parseFloat(c.replace(",", "."));
          const isExtra = /ДОП/i.test(head[i] || "");
          if (!isNaN(v) && /^[\d.,]+$/.test(c)) { total += v; if (isExtra) extra += v; else present++; }
          else if (/^[—–-]$/.test(c)) missed++;
        });
      }
      const s = SUBJ()[t.code];
      out.push({ code: t.code, title: s.title, color: s.color, exam: s.exam, total, present, missed, extra });
    }
    return out;
  }

  function scoreRow(r) {
    const steps = r.exam === "Зачёт" ? [70, 100] : [70, 100, 110, 120];
    const max = Math.max(130, r.total + 10);
    const reach = steps.filter((x) => r.total >= x).pop();
    const label = { 70: "допуск", 100: r.exam === "Зачёт" ? "зачёт" : "«удовл.»", 110: "«хорошо»", 120: "«отлично»" };
    const nextStep = steps.find((x) => r.total < x);
    return `<div class="score-row"><header><span><a href="#/s/${r.code}">${esc(r.title)}</a><br><small class="muted">посещений ${r.present}, пропусков ${r.missed}${r.extra ? `, доп. баллов ${r.extra}` : ""}</small></span><b>${r.total}</b></header>
      <div class="meter" style="--c:${r.color}"><i style="width:${Math.min(100, (r.total / max) * 100)}%"></i>${steps.map((x) => `<span class="tick" style="left:${(x / max) * 100}%"><span>${x}</span></span>`).join("")}</div>
      <small class="muted">${reach ? `Набрано на ${label[reach]}.` : "Допуск ещё не набран."}${nextStep ? ` До ${label[nextStep]}: ${nextStep - r.total}.` : ""}</small></div>`;
  }

  async function member(i) {
    i = +i;
    const n = S.group.students[i];
    if (!n) return (app.innerHTML = '<div class="card empty-state">Участник не найден.</div>');
    const me = store.get("me", null);
    app.innerHTML = `<section class="card cover"><div class="cover-band"><i></i><i></i><i></i><i></i></div>
      <div class="cover-body"><div class="avatar-xl" style="background:${PALETTE[i % 4]};color:${i % 4 === 2 ? "#202124" : "#fff"}">${esc(initials(n))}</div>
      <div class="cover-meta"><h1>${esc(n)}</h1><div class="muted">${esc(S.group.name)} · ${esc(S.group.level)}</div></div>
      <button class="tab ${me === i ? "active" : ""}" id="me">${me === i ? "Это вы" : "Это я"}</button></div></section>
      <section class="card"><h3>Баллы по кафедральным дисциплинам</h3><div id="sc" class="muted">Считаю по таблицам рейтинга…</div>
      <p class="small faint" style="margin:12px 0 0">По таблицам «Рейтинг» на дату последнего импорта из Craft. Официальные баллы выставляет преподаватель. Актуальный журнал, заявки и прогноз в разделе <a href="#/calc">Баллы БРС</a>.</p></section>`;
    $("#me").onclick = () => { store.set("me", me === i ? null : i); route(); toast(me === i ? "Отметка снята" : "Запомнено в этом браузере"); };
    const sc = await scoresFor(n);
    $("#sc").outerHTML = sc.length ? `<div>${sc.map(scoreRow).join("")}</div>` : '<div class="muted">Данных нет.</div>';
  }

  function contacts() {
    const g = S.group;
    app.innerHTML = `<h2 style="margin:4px 0 14px">Контакты и беседы</h2>
      <section class="card"><h3>Преподаватели и учебный отдел</h3>${g.people.map((p, i) => `<div class="person">${personAvatar(p.name, i)}<div><b>${esc(p.name)}</b><div class="muted small">${esc(p.role)}</div><div class="lines">${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : ""}${p.telegram ? `<a href="https://t.me/${esc(p.telegram)}" target="_blank" rel="noopener">@${esc(p.telegram)}</a>` : ""}${p.vk ? `<a href="${esc(p.vk)}" target="_blank" rel="noopener">ВКонтакте</a>` : ""}</div>${p.place ? `<div class="small muted">${esc(p.place)}</div>` : ""}</div></div>`).join("")}</section>
      <section class="card"><h3>Группа</h3>
        <div class="person"><span class="avatar" style="--c:#EA4335">@</span><div><b>Почта группы</b><div class="lines"><a href="mailto:${esc(g.mail.address)}">${esc(g.mail.address)}</a><a href="${g.mail.web}" target="_blank" rel="noopener">Открыть в Mail.ru</a></div><div class="small muted">${esc(g.mail.note)}</div></div></div>
        <div class="person"><span class="avatar" style="--c:#202124">${icon("video", 18)}</span><div><b>${esc(g.video.title)}</b><div class="lines"><a href="${g.video.url}" target="_blank" rel="noopener">Подключиться</a></div></div></div>
      </section>
      <section class="card"><h3>Беседы</h3>${g.chats.map((c) => `<a class="chat" href="${c.url}" target="_blank" rel="noopener">${appAvatar(c.app)}<span><b>${esc(c.title)}</b><small>${esc(c.app)}</small></span></a>`).join("")}</section>`;
  }

  function tgSetupHint() {
    return `<div class="setup" style="text-align:left"><b>Канал «${esc(S.group.channel.title)}» ещё не подключён.</b> Посты появятся здесь, когда бот из <code>TG_BOT_TOKEN</code> будет администратором канала. Инструкция в README. Пока канал можно <a href="${esc(S.group.channel.url)}" target="_blank" rel="noopener">открыть в Telegram</a>.</div>`;
  }



  /* ---------- Действия ---------- */
  function bindActions() {
    document.querySelectorAll("[data-href]").forEach((el) => (el.onclick = (e) => { e.preventDefault(); location.hash = el.dataset.href; }));
    document.querySelectorAll("[data-like]").forEach((b) => (b.onclick = () => { b.classList.toggle("on", toggleIn("likes", b.dataset.like)); }));
    document.querySelectorAll("[data-save]").forEach((b) => (b.onclick = () => {
      const on = toggleIn("saved", b.dataset.save);
      b.classList.toggle("on", on);
      b.innerHTML = `${icon("save", 18)} ${on ? "Сохранено" : "Сохранить"}`;
      toast(on ? "Добавлено в «Сохранённое»" : "Убрано из «Сохранённого»");
    }));
    document.querySelectorAll("[data-share]").forEach((b) => (b.onclick = async () => {
      const url = location.origin + location.pathname + b.dataset.share;
      try {
        if (navigator.share && matchMedia("(max-width: 760px)").matches) await navigator.share({ url });
        else { await navigator.clipboard.writeText(url); toast("Ссылка скопирована"); }
      } catch (e) { /* отмена */ }
    }));
  }

  /* ---------- Поиск ---------- */
  let index = null;
  async function buildIndex() {
    if (index) return index;
    const docs = [];
    for (const s of S.tree.subjects) {
      docs.push({ title: SUBJ()[s.code].title, sub: "Дисциплина", href: `#/s/${s.code}`, path: subjPath(s.code) });
      for (const p of s.pages) if (!p.empty) docs.push({ title: p.title, sub: SUBJ()[s.code].title, href: `#/s/${s.code}/${p.slug}`, path: subjPath(s.code, p.slug) });
    }
    for (const [slug, title] of [["hw", "Домашние задания"], ["brs", "Баллы (БРС)"], ["vkr", "ВКР"], ["contacts", "Контакты"], ["schedule", "Расписание"], ["events", "Конференции"]])
      docs.push({ title, sub: "Раздел", href: `#/${slug}`, path: `content/pages/${slug}.md` });
    await Promise.all(docs.map(async (d) => { d.text = MD.plain(await getMD(d.path)); }));
    for (const e of S.events) docs.push({ title: e.title, sub: "Мероприятие", href: "#/events", text: e.title });
    return (index = docs);
  }
  function setupSearch() {
    const input = $("#q"), box = $("#results");
    let timer;
    input.addEventListener("focus", buildIndex, { once: true });
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { box.classList.remove("open"); return; }
        const docs = await buildIndex();
        const res = [];
        for (const d of docs) {
          const ti = d.title.toLowerCase().includes(q);
          const pos = d.text ? d.text.toLowerCase().indexOf(q) : -1;
          if (!ti && pos < 0) continue;
          let snip = "";
          if (pos >= 0) {
            const a = Math.max(0, pos - 50);
            snip = (a ? "…" : "") + esc(d.text.slice(a, pos)) + "<mark>" + esc(d.text.slice(pos, pos + q.length)) + "</mark>" + esc(d.text.slice(pos + q.length, pos + q.length + 70)) + "…";
          }
          res.push({ d, score: ti ? 0 : 1, snip });
        }
        res.sort((a, b) => a.score - b.score);
        box.innerHTML = res.length ? res.slice(0, 20).map(({ d, snip }) => `<a href="${d.href}"><b>${esc(d.title)}</b><small>${esc(d.sub)}</small>${snip ? `<small>${snip}</small>` : ""}</a>`).join("") : '<a><small>Ничего не найдено</small></a>';
        box.classList.add("open");
      }, 160);
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.classList.remove("open"); });
    box.addEventListener("click", () => { box.classList.remove("open"); input.value = ""; });
    document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); } });
  }

  /* ---------- Левое меню ---------- */
  function renderLeft() {
    const subj = SUBJ();
    const dlCount = deadlines().filter((x) => days(x.date) <= 7).length;
    const nav = [
      ["", "home", "Лента"], ["schedule", "cal", "Расписание"], ["hw", "check", "ДЗ", dlCount || ""],
      ["subjects", "book", "Дисциплины"], ["events", "award", "Конференции и НИР"], ["calc", "star", "Баллы БРС"],
      ["vkr", "cap", "ВКР"], ["members", "users", "Участники", S.group.students.length], ["contacts", "tg", "Контакты и беседы"],
      ["saved", "save", "Сохранённое"],
    ];
    $("#left").innerHTML = `<nav class="nav">${nav.map(([h, ic, t, c]) => `<a href="#/${h}" data-nav="${h}">${icon(ic)}<span>${t}</span>${c ? `<span class="count">${c}</span>` : ""}</a>`).join("")}
      <hr><div class="nav-title">Сообщества</div>
      ${Object.entries(subj).map(([c, s]) => `<a href="#/s/${c}" data-nav="s/${c}"><span class="subj-dot" style="background:${s.color}"></span><span>${esc(s.short)}</span></a>`).join("")}
      <hr><a href="#/about" data-nav="about">${icon("doc")}<span>Craft-оригинал</span></a></nav>`;
  }

  /* ---------- Прогресс чтения ---------- */
  window.addEventListener("scroll", () => {
    if (!$(".reading")) return;
    const h = document.documentElement;
    $("#progress").style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100 + "%";
  }, { passive: true });

  /* ---------- Доступ для редактора ---------- */
  window.KPIB = { S, md, esc, icon, getMD, subjPath, SUBJ, author, avatar, toast, store, route, fmt, iso, today,
    lectureDate, MONF, renderLeft, renderRight, invalidateSearch: () => { index = null; } };

  /* ---------- Старт ---------- */
  async function start() {
    try {
      const [group, schedule, posts, events, tree, tgData, tt] = await Promise.all(
        ["group", "schedule", "posts", "events", "tree", "telegram", "tt"].map((n) => getJSON(`data/${n}.json`).catch(() => null)));
      Object.assign(S, { group, schedule, posts: posts || [], events: events || [], tree, tg: tgData || { items: [] }, tt: tt || null });
      if (!group || !schedule || !tree) throw new Error("data");
    } catch (e) {
      app.innerHTML = '<div class="card empty-state">Не удалось загрузить данные. Если сайт открыт как файл, запустите его через локальный сервер: <code>python3 -m http.server</code>.</div>';
      return;
    }
    $("#tg-link").href = S.group.channel.url;
    $("#tg-link").title = "Канал «" + S.group.channel.title + "»";
    renderLeft();
    renderRight();
    setupSearch();
    window.addEventListener("hashchange", route);
    await route();
    setInterval(renderRight, 60_000);
  }
  start();
})();
