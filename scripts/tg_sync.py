#!/usr/bin/env python3
"""Посты Telegram-канала «Компы Важное» -> лента сайта (data/telegram.json).

Бот должен быть администратором канала (право «Публикация сообщений» не нужно,
достаточно добавить его в администраторы с любым набором прав). Telegram хранит
обновления для бота 24 часа, поэтому workflow запускается каждые полчаса.

Переменные:
  TG_BOT_TOKEN     токен бота
  TG_CHANNEL_ID    id канала (-100…); если не задан, берутся посты из всех каналов,
                   где бот админ, а id печатается в лог
  TG_FILTER_TAG    если задан (например #сайт), публикуются только посты с этим тегом
  TG_SAVE_PHOTOS   0, чтобы не сохранять картинки в репозиторий (по умолчанию 1)
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEED = ROOT / "data" / "telegram.json"
UPLOADS = ROOT / "assets" / "uploads" / "tg"
MSK = timezone(timedelta(hours=3))
KEEP = 400
PHOTO_LIMIT = 5 * 1024 * 1024


def env(n, d=""):
    return os.environ.get(n, d).strip()


def api(method, **params):
    url = f"https://api.telegram.org/bot{env('TG_BOT_TOKEN')}/{method}"
    req = urllib.request.Request(url, json.dumps(params).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    if not data.get("ok"):
        raise RuntimeError(data)
    return data["result"]


def download(file_id, name):
    info = api("getFile", file_id=file_id)
    if info.get("file_size", 0) > PHOTO_LIMIT:
        return None
    url = f"https://api.telegram.org/file/bot{env('TG_BOT_TOKEN')}/{info['file_path']}"
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read()
    UPLOADS.mkdir(parents=True, exist_ok=True)
    ext = Path(info["file_path"]).suffix or ".jpg"
    path = UPLOADS / f"{name}{ext}"
    path.write_bytes(data)
    return "./" + path.relative_to(ROOT).as_posix()


def to_markdown(text, entities):
    """Разметка Telegram (смещения в UTF-16) -> markdown сайта."""
    if not text:
        return ""
    # соответствие позиции UTF-16 -> индексу строки Python
    idx, pos = {}, 0
    for i, ch in enumerate(text):
        idx[pos] = i
        pos += 2 if ord(ch) > 0xFFFF else 1
    idx[pos] = len(text)
    marks = {"bold": ("**", "**"), "italic": ("*", "*"), "code": ("`", "`"), "strikethrough": ("~~", "~~"),
             "underline": ("<u>", "</u>"), "spoiler": ("", "")}
    ins = []
    for e in entities or []:
        a, b = idx.get(e["offset"]), idx.get(e["offset"] + e["length"])
        if a is None or b is None:
            continue
        # не захватываем пробелы внутрь разметки, иначе markdown ломается
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b - 1].isspace():
            b -= 1
        if a >= b:
            continue
        t = e["type"]
        if t == "text_link":
            ins += [(a, 1, "["), (b, 0, f"]({e['url']})")]
        elif t in marks:
            l, r = marks[t]
            ins += [(a, 1, l), (b, 0, r)]
    out = text
    for p, _, s in sorted(ins, key=lambda x: (x[0], x[1]), reverse=True):
        out = out[:p] + s + out[p:]
    return out.strip()


def main():
    if not env("TG_BOT_TOKEN"):
        print("TG_BOT_TOKEN не задан, пропускаю")
        return
    feed = json.loads(FEED.read_text(encoding="utf-8")) if FEED.exists() else {"offset": 0, "items": []}
    want = env("TG_CHANNEL_ID")
    tag = env("TG_FILTER_TAG").lower()
    save_photos = env("TG_SAVE_PHOTOS", "1") == "1"
    updates = api("getUpdates", offset=feed.get("offset", 0) + 1 if feed.get("offset") else 0,
                  allowed_updates=["message", "my_chat_member", "channel_post", "edited_channel_post"], timeout=0)
    chats = feed.get("chats", {})
    items = {i["id"]: i for i in feed.get("items", [])}
    changed = False
    for u in updates:
        feed["offset"] = max(feed.get("offset", 0), u["update_id"])
        changed = True
        for k in ("message", "my_chat_member", "channel_post", "edited_channel_post"):
            c = (u.get(k) or {}).get("chat")
            if c:
                chats[str(c["id"])] = c.get("title") or c.get("username") or c.get("type")
        m = u.get("channel_post") or u.get("edited_channel_post")
        if not m:
            continue
        chat = m["chat"]
        if want and str(chat["id"]) != want:
            print(f"пропуск: канал {chat['id']} {chat.get('title')}")
            continue
        if not want:
            print(f"канал: {chat['id']} {chat.get('title')} (задайте TG_CHANNEL_ID)")
        text = m.get("text") or m.get("caption") or ""
        if tag and tag not in text.lower():
            continue
        key = f"{chat['id']}_{m['message_id']}"
        item = items.get(key, {})
        item.update({
            "id": key,
            "date": datetime.fromtimestamp(m["date"], MSK).isoformat(timespec="minutes"),
            "channel": chat.get("title", ""),
            "text": to_markdown(text, m.get("entities") or m.get("caption_entities")),
            "url": f"https://t.me/c/{str(chat['id']).removeprefix('-100')}/{m['message_id']}",
        })
        if m.get("edit_date"):
            item["edited"] = datetime.fromtimestamp(m["edit_date"], MSK).isoformat(timespec="minutes")
        if m.get("photo") and save_photos and "photo" not in item:
            try:
                p = download(m["photo"][-1]["file_id"], key)
                if p:
                    item["photo"] = p
            except Exception as e:
                print("фото:", e, file=sys.stderr)
        if m.get("document"):
            item["files"] = [m["document"].get("file_name", "файл")]
        if m.get("media_group_id"):
            item["group"] = m["media_group_id"]
        items[key] = item

    # альбом из нескольких фото приходит отдельными сообщениями: склеиваем
    groups = {}
    for it in sorted(items.values(), key=lambda i: i["id"]):
        g = it.get("group")
        if g and g in groups:
            head = groups[g]
            if it.get("photo"):
                head.setdefault("photos", []).append(it["photo"])
            if it.get("text") and not head.get("text"):
                head["text"] = it["text"]
            it["hidden"] = True
        elif g:
            groups[g] = it
    merged = [i for i in items.values() if not i.get("hidden")]
    merged.sort(key=lambda i: i["date"], reverse=True)
    if changed:
        feed = {"offset": feed.get("offset", 0), "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "chats": chats,
                "items": merged[:KEEP]}
        FEED.write_text(json.dumps(feed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"обновлений: {len(updates)}, постов в ленте: {len(merged)}")


if __name__ == "__main__":
    main()
