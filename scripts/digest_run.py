#!/usr/bin/env python3
"""Запуск сводки «пары и дедлайны» с проверкой времени.

GitHub запускает задачи по расписанию с опозданием, иногда на несколько часов. Поэтому режим
выбирается по фактическому времени в Москве, а не по тому, какой cron сработал:
  06:00–11:59 МСК  -> утренняя «Сегодня»
  17:00–23:29 МСК  -> вечерняя «Завтра»
  иначе            -> ничего не отправляется (сводка, пришедшая ночью или днём, только мешает)
Каждая сводка уходит не больше одного раза в день: отметка хранится в data/digest_sent.json.
Workflow стартует несколько раз в каждом окне, первая успешная попытка отправляет.

    python3 scripts/digest_run.py            # авто
    python3 scripts/digest_run.py today      # принудительно, без проверки окна и отметки
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "data" / "digest_sent.json"
MSK = timezone(timedelta(hours=3))


def main():
    forced = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ("today", "tomorrow") else None
    now = datetime.now(MSK)
    hm = now.hour * 60 + now.minute
    mode = forced or ("today" if 6 * 60 <= hm < 12 * 60 else "tomorrow" if 17 * 60 <= hm < 23 * 60 + 30 else None)
    if not mode:
        print(f"{now:%H:%M} МСК: вне окон сводки (06:00–12:00, 17:00–23:30), пропускаю")
        return
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    day = now.strftime("%Y-%m-%d")
    if not forced and state.get(mode) == day:
        print(f"сводка «{mode}» за {day} уже отправлена")
        return
    ok = subprocess.run([sys.executable, str(ROOT / "scripts" / "notify.py"), "digest", mode]).returncode == 0
    if os.environ.get("TG_BOT_TOKEN") and os.environ.get("TG_CHAT_ID"):
        ok = subprocess.run([sys.executable, str(ROOT / "scripts" / "tg_digest.py"), mode]).returncode == 0 or ok
    if ok and not forced:
        state[mode] = day
        STATE.write_text(json.dumps(state, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{now:%H:%M} МСК: сводка «{mode}» {'отправлена' if ok else 'не отправилась'}")


if __name__ == "__main__":
    main()
