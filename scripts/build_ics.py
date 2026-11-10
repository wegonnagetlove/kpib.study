#!/usr/bin/env python3
"""Календарь группы calendar.ics: пары по расписанию ВШГА, дедлайны и мероприятия.

На телефоне и в Google/Apple Календаре на него подписываются по ссылке
webcal://wegonnagetlove.github.io/kpib.study/calendar.ics, календарь обновляется сам.

    python3 scripts/build_ics.py
"""
import hashlib
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "calendar.ics"
TZ = "Europe/Moscow"


def load(n, d=None):
    p = ROOT / "data" / f"{n}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else d


def esc(s):
    return re.sub(r"([,;\\])", r"\\\1", str(s or "")).replace("\n", "\\n")


def plain(md):
    t = re.sub(r"<[^>]+>", "", md or "")
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    return re.sub(r"[*_`#]", "", t).strip()


def fold(line):
    b = line.encode("utf-8")
    out, cur = [], b""
    for ch in line:
        e = ch.encode("utf-8")
        if len(cur) + len(e) > 73:
            out.append(cur.decode("utf-8"))
            cur = b" " + e
        else:
            cur += e
    out.append(cur.decode("utf-8"))
    return "\r\n".join(out)


def uid(*parts):
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:16] + "@kpib.study"


def main():
    group, sch, tt = load("group"), load("schedule"), load("tt", {})
    dead = {u.rstrip("/") for u, r in (load("links", {}) or {}).get("urls", {}).items() if r.get("state") in ("dead", "closed")}
    live = lambda u: u if u and u.rstrip("/") not in dead else ""
    site = group.get("notify", {}).get("site", "https://wegonnagetlove.github.io/kpib.study/")
    stamp = "20260901T000000Z"  # постоянная метка, чтобы файл не менялся без причины
    ev = []

    def add(uid_, summary, start, end=None, allday=False, desc="", loc="", url=""):
        lines = ["BEGIN:VEVENT", f"UID:{uid_}", f"DTSTAMP:{stamp}", f"SUMMARY:{esc(summary)}"]
        if allday:
            d = date.fromisoformat(start)
            lines += [f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}", "TRANSP:TRANSPARENT"]
        else:
            lines += [f"DTSTART;TZID={TZ}:{start}", f"DTEND;TZID={TZ}:{end}"]
        if loc:
            lines.append(f"LOCATION:{esc(loc)}")
        if desc:
            lines.append(f"DESCRIPTION:{esc(desc[:900])}")
        if url:
            lines.append(f"URL:{url}")
        if allday:
            lines += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(summary)}", "TRIGGER:-PT15H", "END:VALARM"]
        lines.append("END:VEVENT")
        ev.append("\r\n".join(fold(l) for l in lines))

    # Пары: официальное расписание ВШГА, без военной кафедры (как на сайте)
    for l in (tt or {}).get("lessons", []):
        if l.get("short") == "ВоенКаф":
            continue
        d = l["date"].replace("-", "")
        s, e = l["start"].replace(":", "") + "00", l["end"].replace(":", "") + "00"
        add(uid("tt", l["date"], l["start"], l["short"]), f"{l['short']}: {l['kind']}",
            f"{d}T{s}", f"{d}T{e}", desc=f"{l['title']}\n{l.get('teacher', '')}", loc=f"ауд. {l['room']}" if l.get("room") else "",
            url=site + "#/schedule")

    # Дедлайны из ленты
    subjects = sch["subjects"]
    for p in load("posts", []) or []:
        if p.get("done"):
            continue
        who = subjects.get(p.get("author"), {}).get("short") or p.get("author", "")
        title = plain(p.get("text", "")).split("\n")[0][:80]
        if p.get("deadline"):
            add(uid("post", p["id"], p["deadline"]), f"⏰ {who}: {title}", p["deadline"], allday=True,
                desc=plain(p.get("text", "")), url=site + f"#/p/{p['id']}")
        for d, t in p.get("deadlines", []):
            add(uid("post", p["id"], d, t), f"⏰ {t}", d, allday=True, desc=plain(p.get("text", "")), url=site + f"#/p/{p['id']}")

    # Мероприятия, подходящие по профилю: заявка и дата проведения
    for e in load("events", []) or []:
        if e.get("fit") != "Подходит":
            continue
        if e.get("deadline"):
            add(uid("evd", e["title"], e["deadline"]), f"📝 Заявка: {e['title']}", e["deadline"], allday=True,
                desc=f"{e.get('type', '')}, {e.get('points', '?')} баллов", url=live(e.get("url")) or site + "#/events")
        if e.get("date"):
            add(uid("ev", e["title"], e["date"]), f"🎓 {e['title']}", e["date"], allday=True,
                desc=f"{e.get('type', '')}, {e.get('format', '')}", url=live(e.get("url")) or site + "#/events")

    head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//kpib.study//104 KPIB//RU", "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH", "X-WR-CALNAME:104 КПИБ", f"X-WR-TIMEZONE:{TZ}", "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
            "X-PUBLISHED-TTL:PT3H",
            "BEGIN:VTIMEZONE", f"TZID:{TZ}", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0300",
            "TZOFFSETTO:+0300", "TZNAME:MSK", "END:STANDARD", "END:VTIMEZONE"]
    text = "\r\n".join(head + sorted(ev) + ["END:VCALENDAR"]) + "\r\n"
    old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    if text != old:
        OUT.write_text(text, encoding="utf-8", newline="")
    print(f"calendar.ics: событий {len(ev)}{'' if text != old else ' (без изменений)'}")


if __name__ == "__main__":
    main()
