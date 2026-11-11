#!/usr/bin/env python3
"""Пуш-уведомления на телефон через ntfy (веб-версия ntfy.sh/app или приложение ntfy).

    python3 scripts/notify.py              # новые посты канала и ленты -> уведомления
    python3 scripts/notify.py digest today # сводка «пары и дедлайны» на сегодня
    python3 scripts/notify.py digest tomorrow
    python3 scripts/notify.py test         # пробное уведомление

Тема и сервер берутся из data/group.json -> notify. Что уже отправлено, хранится
в data/notified.json; при первом запуске всё текущее помечается отправленным без рассылки.
"""
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "data" / "notified.json"
MAX_PER_RUN = 6


def load(name, default=None):
    p = ROOT / "data" / f"{name}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


CFG = load("group")["notify"]


def plain(md):
    t = re.sub(r"<[^>]+>", "", md or "")
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^\s*#{1,6}\s*", "", t, flags=re.M)
    t = re.sub(r"[*_`]", "", t)
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t


def cut(t, n=700):
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"


def send(title, message, click="", tags=None, priority=3):
    body = {"topic": CFG["topic"], "title": title, "message": message, "priority": priority,
            "click": click or CFG["site"], "tags": tags or []}
    req = urllib.request.Request(CFG["server"].rstrip("/") + "/", json.dumps(body).encode("utf-8"),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()
    print("отправлено:", title, "|", message[:60].replace("\n", " "))


def author_name(a, subjects):
    s = subjects.get(a)
    return s["title"] if s else a


def collect():
    items = []
    for t in (load("telegram", {}) or {}).get("items", []):
        items.append(("t:" + t["id"], t.get("date", ""), {
            "title": "Компы Важное", "message": cut(plain(t.get("text") or "Фото")),
            "click": CFG["site"] + "#/feed/tg", "tags": ["loudspeaker"], "priority": 4}))
    subjects = load("schedule")["subjects"]
    for p in load("posts", []) or []:
        if p.get("done"):
            continue
        msg = plain(p.get("text", ""))
        dl = p.get("deadline") or (p.get("deadlines") or [[None]])[0][0]
        if dl:
            msg += f"\n\nСрок: {dl[8:10]}.{dl[5:7]}"
        items.append(("p:" + p["id"], p.get("date", ""), {
            "title": author_name(p.get("author", ""), subjects), "message": cut(msg),
            "click": CFG["site"] + f"#/p/{p['id']}",
            "tags": ["pushpin"] if "ДЗ" in (p.get("tags") or []) else ["memo"]}))
    return sorted(items, key=lambda x: x[1])


def quiet_now():
    """С 23:30 до 07:30 по Москве пуши о новых постах не шлём: они уйдут при первом утреннем запуске."""
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone(timedelta(hours=3)))
    hm = now.hour * 60 + now.minute
    return hm >= 23 * 60 + 30 or hm < 7 * 60 + 30


def run_new():
    items = collect()
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else None
    if state is None:
        STATE.write_text(json.dumps({"sent": sorted(i[0] for i in items)}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
        print(f"первый запуск: {len(items)} записей помечены отправленными, рассылки нет")
        return
    sent = set(state["sent"])
    new = [i for i in items if i[0] not in sent]
    if new and quiet_now():
        print(f"тихие часы: {len(new)} новых записей отправлю утром")
        return
    for key, _, n in new[-MAX_PER_RUN:]:
        try:
            send(**n)
        except Exception as e:
            print("ntfy:", e, file=sys.stderr)
            continue
        sent.add(key)
    if len(new) > MAX_PER_RUN:
        rest = len(new) - MAX_PER_RUN
        send("Рабочий стол 104 КПИБ", f"И ещё {rest} новых записей на сайте.", CFG["site"])
        sent.update(k for k, _, _ in new)
    if new:
        STATE.write_text(json.dumps({"sent": sorted(sent)}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"новых: {len(new)}")


def run_digest(mode):
    sys.path.insert(0, str(Path(__file__).parent))
    import tg_digest
    text = tg_digest.build(mode)
    if not text:
        print("Нечего отправлять")
        return
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    lines = text.split("\n")
    send(lines[0], "\n".join(lines[1:]).strip(), CFG["site"] + "#/schedule", ["calendar"])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "new"
    if cmd == "digest":
        run_digest(sys.argv[2] if len(sys.argv) > 2 else "today")
    elif cmd == "test":
        send("Рабочий стол 104 КПИБ", "Уведомления работают.", CFG["site"], ["white_check_mark"])
    else:
        run_new()
