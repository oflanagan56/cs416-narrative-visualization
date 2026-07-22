"""
Builds data/batted_balls.csv from Baseball Savant Statcast search exports.

Pipeline:
  1. Download batted-ball events season by season, in 15-day windows to stay
     under Savant's 25,000-row-per-request cap.
  2. Keep regular-season events only (game_type == "R").
  3. Derive each batter's team from home/away + inning half.
  4. Keep every home run; take a random sample of the other batted balls so the
     served file stays small enough for GitHub Pages while the HR layer is complete.

Usage:
    python prep_data.py            # download + build
    python prep_data.py --build    # rebuild from an existing raw/ directory
"""

import csv
import datetime as dt
import glob
import os
import random
import subprocess
import sys

SEASONS = [2015, 2019, 2025]
NON_HR_SAMPLE = 8000
SEED = 416
RAW = "raw"

SEARCH = ("https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details"
          "&player_type=batter&hfBBT=fly_ball%7Cground_ball%7Cline_drive%7Cpopup%7C"
          "&hfSea={yr}%7C&game_date_gt={a}&game_date_lt={b}")


def windows(year):
    start, stop = dt.date(year, 3, 1), dt.date(year, 11, 1)
    while start < stop:
        end = start + dt.timedelta(days=14)
        yield start.isoformat(), end.isoformat()
        start = end + dt.timedelta(days=1)


def download():
    os.makedirs(RAW, exist_ok=True)
    for yr in SEASONS:
        for a, b in windows(yr):
            path = os.path.join(RAW, f"{yr}_{a}.csv")
            if os.path.exists(path) and os.path.getsize(path) > 200:
                continue
            subprocess.run(["curl", "-s", "--max-time", "240", "-o", path,
                            SEARCH.format(yr=yr, a=a, b=b)], check=False)
            print("downloaded", path)


def fmt_name(s):
    if "," in s:
        last, first = [p.strip() for p in s.split(",", 1)]
        return f"{first} {last}"
    return s


def build():
    random.seed(SEED)
    by_season = {}
    for path in glob.glob(os.path.join(RAW, "*.csv")):
        for r in csv.DictReader(open(path, encoding="utf-8-sig")):
            if r.get("game_type") != "R":
                continue
            ev, la, bt = r.get("launch_speed"), r.get("launch_angle"), r.get("bb_type")
            if not ev or not la or not bt:
                continue
            year = int(r["game_date"][:4])
            team = r["away_team"] if r.get("inning_topbot") == "Top" else r["home_team"]
            by_season.setdefault(year, []).append({
                "player": fmt_name(r.get("player_name", "")),
                "date": r["game_date"],
                "season": year,
                "team": team,
                "ev": round(float(ev), 1),
                "la": round(float(la), 1),
                "distance": r.get("hit_distance_sc") or "",
                "bb_type": bt,
                "events": r.get("events") or "",
                "barrel": 1 if r.get("launch_speed_angle") == "6" else 0,
                "is_hr": 1 if r.get("events") == "home_run" else 0,
            })

    out = []
    for year in sorted(by_season):
        rows = by_season[year]
        hr = [r for r in rows if r["is_hr"]]
        other = [r for r in rows if not r["is_hr"]]
        random.shuffle(other)
        out += hr + other[:NON_HR_SAMPLE]
        print(f"{year}: {len(hr)} HR + {min(len(other), NON_HR_SAMPLE)} sampled")

    random.shuffle(out)
    out.sort(key=lambda d: (d["season"], d["date"], d["team"]))
    cols = ["player", "date", "season", "team", "ev", "la",
            "distance", "bb_type", "events", "barrel", "is_hr"]
    with open("data/batted_balls.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out)
    print(f"wrote data/batted_balls.csv ({len(out)} rows)")


if __name__ == "__main__":
    if "--build" not in sys.argv:
        download()
    build()
