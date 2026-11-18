/* Уведомления: страница настройки (#/notify), подписка через ntfy и звук «аськи»
   для новых постов, пока сайт открыт. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const K = () => window.KPIB;
  const esc = (s) => window.MD.esc(String(s ?? ""));
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  let audio, reg;

  const cfg = () => K().S.group.notify;
  const soundUrl = () => cfg().sound;
  const topicUrl = () => `${cfg().server.replace(/\/$/, "")}/${cfg().topic}`;

  function play() {
    try {
      audio = audio || new Audio(soundUrl());
      audio.currentTime = 0;
      return audio.play().catch(() => {});
    } catch (e) { return Promise.resolve(); }
  }

  async function swReg() {
    if (reg || !("serviceWorker" in navigator)) return reg;
    try { reg = await navigator.serviceWorker.register("sw.js"); } catch (e) { reg = null; }
    return reg;
  }

  async function show(title, body, url) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const r = await swReg();
    const opts = { body, icon: "assets/icon.svg", badge: "assets/icon.svg", tag: url, data: { url }, silent: true };
    if (r) r.showNotification(title, opts); else new Notification(title, opts);
  }

  /* ---------- Слежение за новыми постами, пока сайт открыт ---------- */
  const keysOf = (tg, posts) => [
    ...(tg.items || []).map((t) => ["t:" + t.id, "Компы Важное", t.text || "Фото", "#/feed/tg"]),
    ...(posts || []).filter((p) => !p.done).map((p) => ["p:" + p.id, K().author(p.author).name, p.text, "#/p/" + p.id]),
  ];
  async function fetchKeys() {
    const get = (n) => fetch(`data/${n}.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
    const [tg, posts] = await Promise.all([get("telegram"), get("posts")]);
    return { tg, posts, keys: keysOf(tg, posts) };
  }
  let timer;
  async function check() {
    if (!K().store.get("notifyOn", false)) return;
    let data;
    try { data = await fetchKeys(); } catch (e) { return; }
    const seen = new Set(K().store.get("notifySeen", []));
    const fresh = data.keys.filter(([k]) => !seen.has(k));
    if (!fresh.length) return;
    K().store.set("notifySeen", data.keys.map(([k]) => k));
    K().S.tg = data.tg; K().S.posts = data.posts;
    play();
    for (const [, title, text, hash] of fresh.slice(0, 3)) {
      const body = window.MD.plain(text).slice(0, 180);
      show(title, body, location.origin + location.pathname + hash);
      K().toast(`${title}: ${body.slice(0, 70)}…`);
    }
    K().renderRight && K().renderRight();
    if (/^#\/?(feed.*)?$/.test(location.hash || "#/")) K().route();
  }
  function startWatch() {
    clearInterval(timer);
    if (!K().store.get("notifyOn", false)) return;
    timer = setInterval(check, 2 * 60 * 1000);
    check();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });

  async function enableSite() {
    play(); // звук по нажатию разблокирует автозвук в браузере
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    await swReg();
    const { keys } = await fetchKeys().catch(() => ({ keys: [] }));
    K().store.set("notifySeen", keys.map(([k]) => k));
    K().store.set("notifyOn", true);
    startWatch();
    page();
  }

  /* ---------- Страница настройки ---------- */
  function page() {
    const on = K().store.get("notifyOn", false);
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    const t = cfg().topic;
    const androidSteps = `
      <ol start="2">
        <li>В Chrome: меню ⋮ → <b>«Установить приложение»</b> (или «Добавить на гл. экран»). Так уведомления приходят надёжнее, даже когда браузер закрыт.</li>
        <li><a href="${esc(soundUrl())}" download="aska.mp3">Скачайте звук</a> и в «Файлах» переместите <code>aska.mp3</code> из «Загрузок» в папку <b>Notifications</b>.</li>
        <li>Настройки телефона → Приложения → <b>ntfy</b> (если установили) или <b>Chrome</b> → Уведомления → <b>ntfy.sh</b> → Звук → <b>aska</b>.</li>
        <li>Готово: следующий пост канала или объявление придёт уведомлением с этим звуком.</li>
      </ol>`;
    const host = cfg().server.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const iosSteps = `
      <div class="nstep"><span class="nnum">1</span><div><b>Установите приложение ntfy</b><p>Бесплатное, без регистрации. Уведомления приходят, даже когда телефон заблокирован.</p>
        <a class="nbtn" href="https://apps.apple.com/app/id1625396347" target="_blank" rel="noopener">Открыть в App Store</a></div></div>
      <div class="nstep"><span class="nnum">2</span><div><b>Подпишитесь на тему группы</b><p>В ntfy нажмите <b>«+»</b>, вставьте тему и нажмите <b>Subscribe</b>.${host !== "ntfy.sh" ? ` Сервер: <code>${esc(host)}</code>.` : ""}</p>
        <code class="ntopic">${esc(t)}</code><button class="nbtn" data-copy="${esc(t)}">Скопировать тему</button></div></div>
      <div class="nstep"><span class="nnum">3</span><div><b>Разрешите уведомления</b><p>iPhone спросит при первом запуске. Если отказали: Настройки → Уведомления → ntfy → Допуск уведомлений.</p></div></div>
      <details class="nmore"><summary>Без приложения, через Safari</summary>
        <ol><li>Откройте <a href="${esc(topicUrl())}" target="_blank" rel="noopener">страницу темы</a> в Safari.</li>
        <li>«Поделиться» → <b>«На экран „Домой“»</b>, затем откройте ntfy с этой иконки.</li>
        <li>Нажмите колокольчик и разрешите уведомления. Нужен iOS 16.4 или новее.</li></ol></details>`;
    const iosSound = `<p>Свой звук для уведомлений ntfy iPhone не позволяет. Звук «аськи» можно поставить в Telegram на канал «Компы Важное»:</p>
      <ol><li>Скачайте <a href="${esc(soundUrl())}" download="aska.mp3">aska.mp3</a> и отправьте себе в «Избранное».</li>
      <li>Долгое нажатие на файл → <b>«Сохранить для уведомлений»</b>.</li>
      <li>Канал «Компы Важное» → Уведомления → Звук → <b>aska</b>.</li></ol>`;
    const androidBlock = `
      <div class="nstep"><span class="nnum">1</span><div><b>Подпишитесь</b><p>Откроется ntfy с темой группы: нажмите <b>Subscribe</b> и разрешите уведомления. Можно поставить приложение ntfy из Google Play и добавить тему через «+».</p>
        <a class="nbtn" href="${esc(topicUrl())}" target="_blank" rel="noopener">Подписаться</a> <button class="nbtn sec" data-copy="${esc(t)}">Скопировать тему</button></div></div>
      ${androidSteps}`;
    $("#main").innerHTML = `<article class="card article setup nsetup"><h1>Уведомления на телефон</h1>
      <p class="muted">Что приходит: новые посты канала «Компы Важное», объявления и ДЗ с сайта, утром в 08:40 пары и дедлайны дня, вечером в 20:10 «что завтра».</p>

      <h3>${isIOS ? "iPhone" : "Android"}</h3>
      ${isIOS ? iosSteps : androidBlock}
      <details class="nmore"><summary>${isIOS ? "Инструкция для Android" : "Инструкция для iPhone"}</summary>${isIOS ? androidBlock : iosSteps}</details>

      <h3>Звук «аськи»</h3>
      <div class="chips" style="margin:6px 0 10px"><button class="nbtn sec" id="n-play">▶ Послушать</button><a class="nbtn sec" href="${esc(soundUrl())}" download="aska.mp3">Скачать aska.mp3</a></div>
      ${isIOS ? iosSound : "<p>На Android звук ставится в настройках уведомлений ntfy, шаги выше.</p>"}

      <h3>Звук на этом сайте</h3>
      <p>Пока сайт открыт, новые посты приходят со звуком «аськи» и всплывающим уведомлением. Это для компьютера и открытой вкладки. Когда телефон заблокирован, работает подписка выше.</p>
      <div class="chips" style="margin:10px 0">
        ${on ? `<span class="chip green">Включено</span><button class="nbtn sec" id="n-off">Выключить</button>` : `<button class="nbtn" id="n-on">Включить звук на сайте</button>`}
        ${perm === "denied" ? '<span class="chip red">Уведомления запрещены в браузере: разрешите их в настройках сайта</span>' : ""}
      </div>
      <p class="small faint">Подписка и звук настраиваются на каждом устройстве отдельно.</p>
    </article>`;
    $("#n-play").onclick = play;
    document.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) { const r = document.createRange(); const c = b.parentElement.querySelector(".ntopic"); if (c) { r.selectNode(c); getSelection().removeAllRanges(); getSelection().addRange(r); } }
      const o = b.textContent; b.textContent = "Скопировано"; setTimeout(() => (b.textContent = o), 1500);
    }));
    if ($("#n-on")) $("#n-on").onclick = enableSite;
    if ($("#n-off")) $("#n-off").onclick = () => { K().store.set("notifyOn", false); clearInterval(timer); page(); };
  }

  window.KPIB_EXT = (window.KPIB_EXT || []).concat([[/^notify$/, page]]);
  // старт после загрузки данных приложением
  const wait = setInterval(() => {
    if (window.KPIB && K().S.group) { clearInterval(wait); if (K().store.get("notifyOn", false)) { swReg(); startWatch(); } }
  }, 300);
})();
