"""
Generate fixtures.json for the 2026/27 EPL season (matchdays 1–5).

Pulls live data from football-data.org so the team names, kickoff times, and
fixture IDs are always accurate. Uses the FOOTBALL_DATA_API_KEY env var.

Run:
    python generate_fixtures.py          # writes fixtures.json
    python generate_fixtures.py --dry    # prints without writing
"""

import json
import sys
import os
import urllib.request

API_KEY = os.environ.get("FOOTBALL_DATA_API_KEY", "")
if not API_KEY:
    sys.exit("FOOTBALL_DATA_API_KEY not set")

MATCHDAYS = range(1, 6)   # 1–5 inclusive → 50 matches

# football-data.org shortName -> name BBC Sport uses to identify EPL teams.
# BBC generally uses the short popular name, matching football-data shortName
# for most clubs. Exceptions are mapped here.
BBC_NAME = {
    "Brighton Hove":   "Brighton",
    "Man City":        "Manchester City",
    "Man United":      "Manchester United",
    "Nottingham":      "Nottingham Forest",
    "Coventry City":   "Coventry City",
    "Hull City":       "Hull City",
    "Ipswich Town":    "Ipswich",
}

def bbc_name(short: str) -> str:
    return BBC_NAME.get(short, short)


def fetch_matchday(md: int) -> list:
    url = f"https://api.football-data.org/v4/competitions/PL/matches?matchday={md}"
    req = urllib.request.Request(url, headers={"X-Auth-Token": API_KEY})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["matches"]


def main():
    dry = "--dry" in sys.argv
    fixtures = []
    seq_per_md: dict[int, int] = {}

    for md in MATCHDAYS:
        print(f"Fetching matchday {md}…", end=" ", flush=True)
        matches = fetch_matchday(md)
        print(f"{len(matches)} matches")
        for m in matches:
            seq_per_md[md] = seq_per_md.get(md, 0) + 1
            match_id = f"epl2027_md{md}_{seq_per_md[md]:02d}"
            kickoff_ts = int(
                __import__("datetime").datetime.fromisoformat(
                    m["utcDate"].replace("Z", "+00:00")
                ).timestamp()
            )
            home_short = m["homeTeam"]["shortName"]
            away_short = m["awayTeam"]["shortName"]
            fixtures.append({
                "match_id":          match_id,
                "external_match_id": m["id"],
                "home":              bbc_name(home_short),
                "away":              bbc_name(away_short),
                "home_full":         m["homeTeam"]["name"],
                "away_full":         m["awayTeam"]["name"],
                "kickoff_ts":        kickoff_ts,
                "matchday":          md,
            })

    # Sanity checks
    assert len(fixtures) == 50, f"expected 50, got {len(fixtures)}"
    ids = {f["match_id"] for f in fixtures}
    assert len(ids) == 50, "duplicate match_id"
    ext_ids = {f["external_match_id"] for f in fixtures}
    assert len(ext_ids) == 50, "duplicate external_match_id"

    fixtures.sort(key=lambda f: f["kickoff_ts"])

    if dry:
        print(json.dumps(fixtures, indent=2))
    else:
        with open("fixtures.json", "w") as fh:
            json.dump(fixtures, fh, indent=2)
        print(f"\n✓ fixtures.json written — {len(fixtures)} matches")
        import datetime
        first_ts = fixtures[0]["kickoff_ts"]
        last_ts  = fixtures[-1]["kickoff_ts"]
        print(f"  First kickoff: {datetime.datetime.fromtimestamp(first_ts, tz=datetime.timezone.utc).isoformat()}")
        print(f"  Last kickoff:  {datetime.datetime.fromtimestamp(last_ts,  tz=datetime.timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
