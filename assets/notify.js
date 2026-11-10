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
      <ol>
        <li>Нажмите <b>«Подписаться»</b>: откроется веб-версия ntfy с темой группы. Нажмите «Subscribe» и разрешите уведомления.</li>
        <li>В Chrome: меню ⋮ → <b>«Установить приложение»</b> (или «Добавить на гл. экран»). Так уведомления приходят надёжнее, даже когда браузер закрыт.</li>
        <li><a href="${esc(soundUrl())}" download="aska.mp3">Скачайте звук</a> и в «Файлах» переместите <code>aska.mp3</code> из «Загрузок» в папку <b>Notifications</b>.</li>
        <li>Настройки телефона → Приложения → <b>ntfy</b> (если установили) или <b>Chrome</b> → Уведомления → <b>ntfy.sh</b> → Звук → <b>aska</b>.</li>
        <li>Готово: следующий пост канала или объявление придёт уведомлением с этим звуком.</li>
      </ol>`;
    const iosSteps = `
      <ol>
        <li>Откройте ссылку <b>«Подписаться»</b> в Safari, затем «Поделиться» → <b>«На экран „Домой“»</b>. Нужен iOS 16.4 или новее.</li>
        <li>Запустите ntfy с экрана «Домой», подпишитесь на тему <code>${esc(t)}</code> и разрешите уведомления. Можно вместо этого поставить приложение ntfy из App Store.</li>
        <li>Свой звук для веб-уведомлений iPhone не позволяет: будет стандартный.</li>
        <li><b>Звук «аськи» на iPhone</b> можно поставить в Telegram на канал «Компы Важное»: отправьте <a href="${esc(soundUrl())}" download="aska.mp3">aska.mp3</a> себе в «Избранное», долгое нажатие → <b>«Сохранить для уведомлений»</b>, затем канал → Уведомления → Звук → aska.</li>
      </ol>`;
    $("#main").innerHTML = `<article class="card article setup"><h1>Уведомления на телефон</h1>
      <p class="muted">Новые посты канала «Компы Важное», объявления и ДЗ с сайта, утренняя сводка пар и дедлайнов (08:40) и вечерняя «что завтра» (20:10).</p>
      <div class="chips" style="margin:14px 0">
        <a class="tab active" style="background:var(--blue);border-color:var(--blue)" href="${esc(topicUrl())}" target="_blank" rel="noopener">Подписаться</a>
        <button class="tab" id="n-play">▶ Послушать звук</button>
        <a class="tab" href="${esc(soundUrl())}" download="aska.mp3">Скачать звук</a>
      </div>
      <p class="small muted">Тема: <code>${esc(t)}</code> на <code>${esc(cfg().server.replace(/^https?:\/\//, ""))}</code></p>

      <h3 style="margin-top:22px">${isIOS ? "iPhone" : isAndroid ? "Android" : "Android"}</h3>${isIOS ? iosSteps : androidSteps}
      <details style="margin-top:6px"><summary class="muted">${isIOS ? "Android" : "iPhone"}</summary>${isIOS ? androidSteps : iosSteps}</details>

      <h3 style="margin-top:22px">Звук на этом сайте</h3>
      <p>Пока сайт открыт, новые посты приходят со звуком «аськи» и всплывающим уведомлением. Это для компьютера и открытой вкладки. Когда телефон заблокирован, работает подписка выше.</p>
      <div class="chips" style="margin:10px 0">
        ${on ? `<span class="chip green">Включено</span><button class="tab" id="n-off">Выключить</button>` : `<button class="tab active" id="n-on">Включить звук на сайте</button>`}
        ${perm === "denied" ? '<span class="chip red">Уведомления запрещены в браузере: разрешите их в настройках сайта</span>' : ""}
      </div>
      <p class="small faint">Подписка и звук настраиваются на каждом устройстве отдельно.</p>
    </article>`;
    $("#n-play").onclick = play;
    if ($("#n-on")) $("#n-on").onclick = enableSite;
    if ($("#n-off")) $("#n-off").onclick = () => { K().store.set("notifyOn", false); clearInterval(timer); page(); };
  }

  window.KPIB_EXT = (window.KPIB_EXT || []).concat([[/^notify$/, page]]);
  // старт после загрузки данных приложением
  const wait = setInterval(() => {
    if (window.KPIB && K().S.group) { clearInterval(wait); if (K().store.get("notifyOn", false)) { swReg(); startWatch(); } }
  }, 300);
})();
