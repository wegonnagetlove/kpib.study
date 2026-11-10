#!/usr/bin/env python3
"""Сводка в Telegram-беседу группы: пары на день и ближайшие дедлайны.

    python3 scripts/tg_digest.py today      # утренняя сводка
    python3 scripts/tg_digest.py tomorrow   # вечерняя: что завтра
    python3 scripts/tg_digest.py chats      # показать chat_id бесед, где есть бот
    python3 scripts/tg_digest.py today --dry  # только вывести текст

Переменные: TG_BOT_TOKEN, TG_CHAT_ID, SITE_URL (ссылка на сайт в конце сообщения).
"""
import html
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MSK = timezone(timedelta(hours=3))
TT_CODES = {"ПТГП": "ptgp", "ИнЯз": "eng", "ПВДИ": "pvdi", "АПИП": "apip", "КРР": "krr", "ИстОП": "iop", "ФилПР": "filpr", "ПРОИ": "proi"}
WD = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]


def load(name):
    return json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))


def lessons_on(d, group, sch):
    iso = d.isoformat()
    if not (group["semester"]["start"] <= iso <= group["semester"]["end"]):
        return []
    js_wd = str((d.weekday() + 1) % 7)  # как getDay() в JS
    weekly = sch["weekly"].get(js_wd, [])
    tt_file = ROOT / "data" / "tt.json"
    tt = json.loads(tt_file.read_text(encoding="utf-8")) if tt_file.exists() else {}
    if tt.get("from") and tt["from"] <= iso <= tt.get("to", ""):
        # официальное расписание ВШГА важнее недельной сетки (переносы, отмены)
        weekly = [{"time": f"{l['start']}–{l['end']}", "subject": TT_CODES.get(l["short"]), "title": l["title"],
                   "kind": l["kind"], "room": l["room"]}
                  for l in tt.get("lessons", []) if l["date"] == iso and l["short"] != "ВоенКаф"]
    dep = next((x for x in sch["department"] if x["date"] == iso), None)
    subj = sch["subjects"]
    out = [l for l in weekly if not (dep and l.get("subject") and subj[l["subject"]].get("department"))]
    if dep:
        for code, time, note in dep["items"]:
            h, m = map(int, time.split(":"))
            end = (datetime(2000, 1, 1, h, m) + timedelta(minutes=90)).strftime("%H:%M")
            out.append({"time": f"{time}–{end}", "subject": code, "kind": note, "room": ""})
    return sorted(out, key=lambda l: l["time"])


def deadlines(d, horizon=3):
    posts, events = load("posts"), load("events")
    out = []
    for p in posts:
        if p.get("done"):
            continue
        title = p["text"].split("\n")[0].replace("*", "")[:90]
        if p.get("deadline"):
            out.append((p["deadline"], title))
        for dd, t in p.get("deadlines", []):
            out.append((dd, f"{t}: {title}"))
    for e in events:
        if e.get("deadline") and e.get("status") != "Подала":
            out.append((e["deadline"], f"заявка: {e['title']}"))
    lo, hi = d.isoformat(), (d + timedelta(days=horizon)).isoformat()
    return sorted(x for x in out if lo <= x[0] <= hi)


def build(mode):
    group, sch = load("group"), load("schedule")
    now = datetime.now(MSK).date()
    d = now + timedelta(days=1 if mode == "tomorrow" else 0)
    ls = lessons_on(d, group, sch)
    dl = deadlines(now, 3)
    if not ls and not dl:
        return None
    e = lambda s: html.escape(s, quote=False)
    head = "Завтра" if mode == "tomorrow" else "Сегодня"
    lines = [f"<b>{head}, {WD[d.weekday()]}, {d.day} {MON[d.month - 1]}</b>"]
    if ls:
        for l in ls:
            short = sch["subjects"][l["subject"]]["short"] if l.get("subject") else l.get("title", "")
            room = f", ауд. {l['room']}" if l.get("room") else ""
            lines.append(f"🕘 {l['time']}  <b>{e(short)}</b> · {e(l['kind'])}{e(room)}")
    else:
        lines.append("Пар нет.")
    if dl:
        lines.append("\n<b>Дедлайны на 3 дня</b>")
        for dd, t in dl:
            x = date.fromisoformat(dd)
            lines.append(f"⏰ {x.day} {MON[x.month - 1]}: {e(t)}")
    site = os.environ.get("SITE_URL", "").strip()
    if site:
        lines.append(f'\n<a href="{e(site)}">Рабочий стол группы</a>')
    return "\n".join(lines)


def api(method, payload):
    token = os.environ["TG_BOT_TOKEN"]
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}",
                                 json.dumps(payload).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "today"
    if mode == "chats":
        seen = {}
        for u in api("getUpdates", {}).get("result", []):
            m = u.get("message") or u.get("my_chat_member") or u.get("channel_post") or {}
            c = m.get("chat")
            if c:
                seen[c["id"]] = c.get("title") or c.get("username") or c.get("first_name")
        tf = ROOT / "data" / "telegram.json"
        if tf.exists():
            for cid, title in json.loads(tf.read_text(encoding="utf-8")).get("chats", {}).items():
                seen.setdefault(int(cid), title)
        for cid, title in seen.items():
            print(f"{cid}\t{title}")
        if not seen:
            print("Бот пока не видел сообщений. Добавьте его в беседу и напишите туда что-нибудь.")
        return
    text = build(mode)
    if not text:
        print("Нечего отправлять")
        return
    if "--dry" in sys.argv or not os.environ.get("TG_BOT_TOKEN"):
        print(text)
        return
    api("sendMessage", {"chat_id": os.environ["TG_CHAT_ID"], "text": text, "parse_mode": "HTML",
                        "disable_web_page_preview": True})
    print("Отправлено")


if __name__ == "__main__":
    main()
