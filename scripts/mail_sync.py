#!/usr/bin/env python3
"""Почта группы -> лента сайта и Telegram.

Читает ящик по IMAP, новые письма:
  * добавляет в data/mail.json (тема, отправитель, дата, имена вложений; текст письма
    публикуется только при MAIL_PUBLISH_SNIPPET=1, потому что репозиторий публичный);
  * пересылает в Telegram-беседу (тема, отправитель, начало текста, вложения файлами).

Переменные окружения (в GitHub: Settings -> Secrets and variables -> Actions):
  MAIL_USER             адрес ящика, например cyberlaw2026@mail.ru
  MAIL_PASSWORD         пароль ДЛЯ ВНЕШНЕГО ПРИЛОЖЕНИЯ Mail.ru (не основной пароль)
  IMAP_HOST             по умолчанию imap.mail.ru
  TG_BOT_TOKEN          токен бота от @BotFather (необязательно)
  TG_CHAT_ID            id беседы, куда пересылать (необязательно)
  TG_SEND_ATTACHMENTS   1, чтобы пересылать вложения файлами (по умолчанию 1)
  MAIL_PUBLISH_SNIPPET  1, чтобы показывать начало текста письма на сайте (по умолчанию 0)
  MAIL_DAYS             за сколько дней смотреть письма (по умолчанию 14)
"""
import email
import hashlib
import html
import imaplib
import json
import os
import re
import sys
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEED = ROOT / "data" / "mail.json"
KEEP = 40
TG_LIMIT = 50 * 1024 * 1024


def env(name, default=""):
    return os.environ.get(name, default).strip()


def dec(value):
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def text_of(msg):
    plain, rich = [], []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart" or part.get_filename():
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        payload = part.get_payload(decode=True) or b""
        charset = part.get_content_charset() or "utf-8"
        try:
            body = payload.decode(charset, errors="replace")
        except LookupError:
            body = payload.decode("utf-8", errors="replace")
        (plain if ctype == "text/plain" else rich).append(body)
    if plain:
        t = "\n".join(plain)
    else:
        t = "\n".join(rich)
        t = re.sub(r"(?is)<(script|style).*?</\1>", "", t)
        t = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", t)
        t = html.unescape(re.sub(r"<[^>]+>", "", t))
    # срезаем цитату предыдущего письма
    t = re.split(r"\n-{2,}\s*\n|\n>.*\n>|\nОт кого:|\n-----Original Message", t)[0]
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", t)).strip()


def attachments_of(msg):
    out = []
    for part in msg.walk():
        name = part.get_filename()
        if name:
            data = part.get_payload(decode=True) or b""
            out.append((dec(name), data))
    return out


def tg(method, fields=None, files=None):
    token = env("TG_BOT_TOKEN")
    if not token:
        return None
    url = f"https://api.telegram.org/bot{token}/{method}"
    if files:
        boundary = uuid.uuid4().hex
        body = b""
        for k, v in (fields or {}).items():
            body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        for k, (fname, data) in files.items():
            safe = fname.replace('"', "'")
            body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{safe}\"\r\n"
                     "Content-Type: application/octet-stream\r\n\r\n").encode() + data + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(url, body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    else:
        req = urllib.request.Request(url, json.dumps(fields or {}).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as e:  # не роняем синхронизацию из-за Telegram
        print("telegram:", e, file=sys.stderr)
        return None


def send_to_telegram(item, body, files):
    chat = env("TG_CHAT_ID")
    if not chat or not env("TG_BOT_TOKEN"):
        return
    esc = lambda s: html.escape(s or "", quote=False)
    text = (f"📩 <b>{esc(item['subject'] or '(без темы)')}</b>\n"
            f"От: {esc(item['from_name'])} &lt;{esc(item['from'])}&gt;\n")
    if body:
        snippet = body if len(body) <= 3000 else body[:3000].rsplit(" ", 1)[0] + "…"
        text += "\n" + esc(snippet)
    if item["attachments"]:
        text += "\n\n📎 " + esc(", ".join(item["attachments"]))
    tg("sendMessage", {"chat_id": chat, "text": text[:4096], "parse_mode": "HTML",
                       "disable_web_page_preview": True})
    if env("TG_SEND_ATTACHMENTS", "1") == "1":
        for name, data in files:
            if 0 < len(data) <= TG_LIMIT:
                tg("sendDocument", {"chat_id": chat}, {"document": (name, data)})


def main():
    user, password = env("MAIL_USER"), env("MAIL_PASSWORD")
    if not user or not password:
        print("MAIL_USER/MAIL_PASSWORD не заданы, пропускаю")
        return
    feed = json.loads(FEED.read_text(encoding="utf-8")) if FEED.exists() else {"items": []}
    known = {i["id"] for i in feed.get("items", [])}
    first_run = not known and not feed.get("updated")

    box = imaplib.IMAP4_SSL(env("IMAP_HOST", "imap.mail.ru"))
    box.login(user, password)
    box.select("INBOX", readonly=True)
    since = (datetime.now() - timedelta(days=int(env("MAIL_DAYS", "14")))).strftime("%d-%b-%Y")
    _, data = box.search(None, "SINCE", since)
    ids = data[0].split()[-60:]

    new = []
    for num in ids:
        _, raw = box.fetch(num, "(BODY.PEEK[])")
        msg = email.message_from_bytes(raw[0][1])
        mid = msg.get("Message-ID") or f"{msg.get('Date')}{msg.get('Subject')}"
        key = hashlib.sha1(mid.encode("utf-8", "ignore")).hexdigest()[:12]
        if key in known:
            continue
        name, addr = parseaddr(dec(msg.get("From")))
        try:
            date = parsedate_to_datetime(msg.get("Date")).astimezone(timezone(timedelta(hours=3)))
        except Exception:
            date = datetime.now(timezone(timedelta(hours=3)))
        body = text_of(msg)
        files = attachments_of(msg)
        item = {
            "id": key,
            "date": date.isoformat(timespec="minutes"),
            "from": addr,
            "from_name": name or addr,
            "subject": dec(msg.get("Subject")).strip(),
            "attachments": [n for n, _ in files],
        }
        if env("MAIL_PUBLISH_SNIPPET") == "1" and body:
            item["snippet"] = body[:400] + ("…" if len(body) > 400 else "")
        new.append(item)
        # при первом запуске не засыпаем беседу старыми письмами
        if not first_run:
            send_to_telegram(item, body, files)
    box.logout()

    items = sorted(new + feed.get("items", []), key=lambda i: i["date"], reverse=True)[:KEEP]
    feed = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": items}
    if new or first_run:
        FEED.write_text(json.dumps(feed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"новых писем: {len(new)}{' (первый запуск, в Telegram не отправлялись)' if first_run else ''}")


if __name__ == "__main__":
    main()
