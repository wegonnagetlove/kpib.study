"""Официальное расписание группы с tt.audit.msu.ru → data/tt.json.

Сайт расписания ВШГА отдаёт таблицу на POST формы (Yii2, нужен csrf и cookie сессии).
Забираем окно с прошлой недели на 10 недель вперёд, кусками по 4 недели.

    python3 scripts/tt_sync.py
"""
import json
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
URL = "https://tt.audit.msu.ru/time-table/group?type=0"
FACULTY, COURSE, GROUP = "3", "1", "132"  # ВШГА, 1 курс, 104кпиб
KINDS = {"Сем": "Семинар", "Лк": "Лекция", "Лек": "Лекция", "Пз": "Практика", "Пр": "Практика",
         "Конс": "Консультация", "Экз": "Экзамен", "Зач": "Зачёт", "ЗачО": "Зачёт с оценкой"}
TIME = re.compile(r"^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$")
MSK = timezone(timedelta(hours=3))


def fetch(session, start, end):
    page = session.get(URL, timeout=30)
    page.raise_for_status()
    m = re.search(r'name="csrf-token" content="([^"]+)"', page.text)
    if not m:
        raise RuntimeError("на странице нет csrf-token")
    data = {
        "_csrf-frontend": m.group(1),
        "TimeTableForm[facultyId]": FACULTY, "TimeTableForm[course]": COURSE, "TimeTableForm[groupId]": GROUP,
        "TimeTableForm[dateStart]": start.strftime("%d.%m.%Y"), "TimeTableForm[dateEnd]": end.strftime("%d.%m.%Y"),
        "TimeTableForm[indicationDays]": "5", "time-table-type": "1",
    }
    r = session.post(URL, data=data, timeout=60, headers={"Referer": URL})
    r.raise_for_status()
    return r.text


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None:
        raise RuntimeError("в ответе нет таблицы расписания")
    out, dates = [], []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"], recursive=False)
        if not cells:
            continue
        head = " ".join(cells[0].get_text(" ").split())
        if "пара" not in head:
            dates = [c.get_text(" ").strip() for c in cells[1:]]
            continue
        pm = re.match(r"(\d+)\s*пара\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})", head)
        pair, start, end = (int(pm.group(1)), pm.group(2), pm.group(3)) if pm else (None, "", "")
        for i, cell in enumerate(cells[1:]):
            if i >= len(dates) or not re.match(r"\d{2}\.\d{2}\.\d{4}", dates[i]):
                continue
            d = datetime.strptime(dates[i][:10], "%d.%m.%Y").date().isoformat()
            for el in cell.select("[data-content]"):
                lines = [" ".join(x.split()) for x in BeautifulSoup(el["data-content"], "html.parser").get_text("\n").split("\n")]
                lines = [x for x in lines if x]
                s, e = start, end
                if lines and TIME.match(lines[0]):
                    s, e = TIME.match(lines.pop(0)).groups()
                title, kind = (lines[0] if lines else ""), ""
                km = re.match(r"^(.*?)\s*\[([^\]]+)\]$", title)
                if km:
                    title, kind = km.group(1).strip(), km.group(2)
                room = next((x[4:].strip() for x in lines if x.startswith("ауд.")), "")
                added = next((x.split(":", 1)[1].strip() for x in lines if x.startswith("Добавлено")), "")
                rest = [x for x in lines[1:] if not x.startswith(("ауд.", "Добавлено"))]
                groups = next((x for x in rest if re.search(r"\d{3}[а-яё]*", x) and not re.search(r"[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+", x)), "")
                teacher = next((x for x in rest if x != groups), "")
                short = " ".join(el.get_text(" ").split())
                if not title or short.startswith("Скрыто"):
                    continue  # «Скрыто с …»: деканат ещё не открыл эти даты
                out.append({
                    "date": d, "pair": pair, "start": s.zfill(5), "end": e.zfill(5),
                    "title": title, "short": short.split("[")[0].replace(f"{s}-{e}", "").strip(),
                    "kind": KINDS.get(kind, kind), "room": room, "teacher": teacher, "groups": groups,
                    "added": added,
                })
    return out


def fetch_retry(session, start, end, tries=3):
    for i in range(tries):
        try:
            return fetch(session, start, end)
        except requests.RequestException as e:
            if i == tries - 1:
                raise
            print(f"tt.audit.msu.ru не ответил ({type(e).__name__}), повтор через {60 * (i + 1)} с")
            time.sleep(60 * (i + 1))


def stale(err):
    path = ROOT / "data/tt.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    upd = data.get("checked") or data.get("updated")
    age = datetime.now(MSK) - datetime.fromisoformat(upd) if upd else timedelta(days=99)
    if age < timedelta(hours=48):
        print(f"::warning::tt.audit.msu.ru недоступен ({type(err).__name__}); на сайте остаётся расписание от {upd}")
        return
    sys.exit(f"tt.audit.msu.ru недоступен больше двух суток (последнее обновление {upd}): {err}")


def main():
    today = datetime.now(MSK).date()
    start = today - timedelta(days=today.weekday() + 7)
    stop = start + timedelta(weeks=11) - timedelta(days=1)
    s = requests.Session()
    s.headers["User-Agent"] = "kpib-study-schedule/1.0 (+https://kpib-study.tatnet.app)"
    lessons, a = [], start
    try:
        while a <= stop:
            b = min(a + timedelta(weeks=4) - timedelta(days=1), stop)
            lessons += parse(fetch_retry(s, a, b))
            a = b + timedelta(days=1)
    except requests.RequestException as e:
        # Сайт ВШГА иногда не отвечает (ночью, на обслуживании). Оставляем прошлые данные;
        # падаем (и шлём письмо) только если расписание не обновлялось больше двух суток
        stale(e)
        return
    seen, uniq = set(), []
    for l in sorted(lessons, key=lambda x: (x["date"], x["start"], x["title"])):
        k = (l["date"], l["start"], l["title"], l["room"])
        if k not in seen:
            seen.add(k)
            uniq.append(l)
    if not uniq:
        sys.exit("расписание пустое, data/tt.json не меняю")
    path = ROOT / "data/tt.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    now = datetime.now(MSK).isoformat(timespec="minutes")
    if old.get("lessons") == uniq and old.get("from") == start.isoformat():
        # «checked» раз в сутки: по нему видно, что сайт ВШГА отвечал, даже если расписание не менялось
        last = old.get("checked") or old.get("updated")
        if last and datetime.now(MSK) - datetime.fromisoformat(last) < timedelta(hours=20):
            print("без изменений")
            return
        old["checked"] = now
        path.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding="utf-8")
        print("без изменений, отметка проверки")
        return
    path.write_text(json.dumps({
        "updated": now, "checked": now, "source": URL,
        "from": start.isoformat(), "to": stop.isoformat(), "lessons": uniq,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"занятий: {len(uniq)}, {start} – {stop}")


if __name__ == "__main__":
    main()
