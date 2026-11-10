#!/usr/bin/env python3
"""Проверка всех внешних ссылок сайта -> data/links.json.

Сайт по этому файлу прячет нерабочие ссылки (оставляет текст без ссылки), поэтому
мёртвые адреса из Craft пропадают сами, без правки документа.

Состояния:
  ok       открывается
  dead     404/410, сайт не существует, не отвечает
  closed   Google/Яндекс-форма больше не принимает ответы, приглашение в Telegram недействительно
  login    нужна авторизация (личные кабинеты, приватные документы) — ссылку оставляем
  unknown  сайт не пускает роботов (403, капча) — ссылку оставляем

    python3 scripts/check_links.py
"""
import concurrent.futures as cf
import json
import re
import socket
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "links.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
SKIP_HOSTS = {"fonts.googleapis.com", "wegonnagetlove.github.io", "ntfy.sh"}
LOGIN_HOSTS = {"lk.msu.ru", "e.mail.ru", "tt.audit.msu.ru"}
URL_RE = re.compile(r"https?://[^\s\)\[\]\"'<>`|\\]+")

CLOSED = [
    "больше не принимает ответы", "no longer accepting responses", "форма закрыта",
    "форма недоступна", "приём ответов завершён", "прием ответов завершен", "опрос завершён", "опрос завершен",
    "this form is closed", "форма больше не доступна",
]
NOT_FOUND = ["страница не найдена", "page not found", "404 not found", "ошибка 404", "не удалось найти"]


def collect():
    urls = {}
    files = list((ROOT / "data").glob("*.json")) + list((ROOT / "content").rglob("*.md")) + \
        list((ROOT / "brs").glob("*.html")) + [ROOT / "index.html"]
    for f in files:
        if f.name in ("tt.json", "notified.json", "links.json"):
            continue
        for u in URL_RE.findall(f.read_text(encoding="utf-8")):
            u = u.rstrip(".,;:*")
            u = u.split("\\n")[0]
            urls.setdefault(u, set()).add(str(f.relative_to(ROOT)))
    return urls


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en;q=0.8",
                                               "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
        body = r.read(400_000)
        return r.status, r.geturl(), body.decode(r.headers.get_content_charset() or "utf-8", "replace")


def classify(url):
    host = re.sub(r"^https?://([^/]+).*", r"\1", url).lower()
    if host in LOGIN_HOSTS:
        return {"state": "login", "why": "личный кабинет"}
    last = None
    for attempt in range(2):
        try:
            code, final, html = fetch(url)
            low = html.lower()
            if "accounts.google.com" in final or "passport.yandex" in final or "/login" in final:
                return {"state": "login", "code": code, "final": final, "why": "нужен вход"}
            if any(x in low for x in CLOSED):
                return {"state": "closed", "code": code, "final": final, "why": "форма больше не принимает ответы"}
            if host == "t.me" and "/+" in url or "joinchat" in url:
                if "tgme_page_title" not in html:
                    return {"state": "closed", "code": code, "final": final, "why": "приглашение в Telegram недействительно"}
            if host in ("chat.whatsapp.com",) and ("invite link" in low and "revoked" in low or "ссылка-приглашение" in low and "недействит" in low):
                return {"state": "closed", "code": code, "final": final, "why": "приглашение WhatsApp недействительно"}
            title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
            t = (title.group(1).strip().lower() if title else "")
            if any(x in t for x in NOT_FOUND):
                return {"state": "dead", "code": code, "final": final, "why": "страница не найдена"}
            return {"state": "ok", "code": code, "final": final}
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return {"state": "dead", "code": e.code, "why": f"HTTP {e.code}"}
            if e.code in (401,):
                return {"state": "login", "code": e.code, "why": "нужен вход"}
            if e.code in (403, 429, 999):
                return {"state": "unknown", "code": e.code, "why": "сайт не пускает роботов"}
            # 5xx бывает временно: ссылку не прячем
            last = {"state": "unknown", "code": e.code, "why": f"HTTP {e.code}"}
        except (urllib.error.URLError, socket.timeout, ConnectionError, ssl.SSLError) as e:
            reason = str(getattr(e, "reason", e))
            if "Name or service not known" in reason or "nodename nor servname" in reason or "No address" in reason:
                return {"state": "dead", "why": "сайт не существует"}
            # таймаут с серверов GitHub (США) часто означает блокировку зарубежных адресов у .ru/.by сайтов
            last = {"state": "unknown", "why": f"не отвечает: {reason[:80]}"}
        except Exception as e:  # noqa: BLE001
            last = {"state": "unknown", "why": str(e)[:80]}
    return last


def main():
    urls = collect()
    todo = {u: f for u, f in urls.items() if re.sub(r"^https?://([^/]+).*", r"\1", u).lower() not in SKIP_HOSTS}
    res = {}
    with cf.ThreadPoolExecutor(12) as ex:
        for u, r in zip(todo, ex.map(classify, todo)):
            r["files"] = sorted(todo[u])
            res[u] = r
    now = datetime.now(timezone.utc).isoformat(timespec="minutes")
    out = {"checked": now, "urls": dict(sorted(res.items()))}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    from collections import Counter
    print(Counter(r["state"] for r in res.values()))
    for u, r in res.items():
        if r["state"] in ("dead", "closed"):
            print(f"{r['state']:7} {u}  ({r.get('why')})  в {', '.join(r['files'])}")


if __name__ == "__main__":
    main()
