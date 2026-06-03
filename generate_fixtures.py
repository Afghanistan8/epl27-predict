"""
Generate fixtures.json for the 2026 FIFA World Cup group stage.

Outputs a JSON array of 72 match objects with the shape:
  {
    "match_id": "wc2026_g_A01",      # stable ID for use in Supabase & contracts
    "home": "Mexico",                 # BBC-Sport-friendly team name
    "away": "South Africa",
    "kickoff_ts": 1749661200,        # unix seconds UTC
    "group": "A",
    "matchday": 1,
    "venue": "Mexico City"
  }

EDT is UTC-4 during June, so all conversions assume EDT throughout.
"""

import json
from datetime import datetime, timezone, timedelta

# Map of "display name on schedule" -> "name to use for BBC matching".
# BBC Sport typically uses these forms for World Cup teams.
#
# Play-off winners (resolved 31 March 2026):
#   UEFA Play-off A -> Bosnia-Herzegovina  (Group B)
#   UEFA Play-off B -> Sweden              (Group F)
#   UEFA Play-off C -> Turkey              (Group D)
#   UEFA Play-off D -> Czechia             (Group A)
#   FIFA Play-off 1 -> DR Congo            (Group K)
#   FIFA Play-off 2 -> Iraq                (Group I)
TEAM_NORMALIZE = {
    "USA": "United States",
    "South Korea": "South Korea",
    "Côte d'Ivoire": "Ivory Coast",
    "Cape Verde": "Cape Verde",
    "Curaçao": "Curacao",
    "UEFA Play-off A": "Bosnia-Herzegovina",
    "UEFA Play-off B": "Sweden",
    "UEFA Play-off C": "Turkey",
    "UEFA Play-off D": "Czechia",
    "FIFA Play-off 1": "DR Congo",
    "FIFA Play-off 2": "Iraq",
}

def normalize(team: str) -> str:
    return TEAM_NORMALIZE.get(team, team)

def ts(date_str: str, time_str: str) -> int:
    """
    Convert ('Jun 11', '3:00 PM') EDT to a UTC unix timestamp.
    Handles cross-midnight wrap (e.g., '12:00 AM' on Jun 13 EDT == Jun 13 04:00 UTC).
    """
    # Parse the EDT datetime first
    dt_str = f"2026 {date_str} {time_str}"
    edt = datetime.strptime(dt_str, "%Y %b %d %I:%M %p")
    edt = edt.replace(tzinfo=timezone(timedelta(hours=-4)))  # EDT
    utc = edt.astimezone(timezone.utc)
    return int(utc.timestamp())


# Raw match data extracted from the schedule.
# Format: (date_str, time_str, group, home, away, matchday, venue)
RAW_MATCHES = [
    # ==================== MATCHDAY 1 ====================
    # Group A
    ("Jun 11", "3:00 PM",  "A", "Mexico",          "South Africa",       1, "Mexico City"),
    ("Jun 11", "9:00 PM",  "A", "South Korea",     "UEFA Play-off D",    1, "Guadalajara"),
    # Group B
    ("Jun 12", "3:00 PM",  "B", "Canada",          "UEFA Play-off A",    1, "Toronto"),
    ("Jun 13", "3:00 PM",  "B", "Qatar",           "Switzerland",        1, "San Francisco Bay Area"),
    # Group C
    ("Jun 13", "6:00 PM",  "C", "Brazil",          "Morocco",            1, "New York/New Jersey"),
    ("Jun 13", "9:00 PM",  "C", "Haiti",           "Scotland",           1, "Boston"),
    # Group D
    ("Jun 12", "9:00 PM",  "D", "United States",   "Paraguay",           1, "Los Angeles"),
    ("Jun 13", "12:00 AM", "D", "Australia",       "UEFA Play-off C",    1, "Vancouver"),
    # Group E
    ("Jun 14", "1:00 PM",  "E", "Germany",         "Curacao",            1, "Houston"),
    ("Jun 14", "7:00 PM",  "E", "Ivory Coast",     "Ecuador",            1, "Philadelphia"),
    # Group F
    ("Jun 14", "4:00 PM",  "F", "Netherlands",     "Japan",              1, "Dallas"),
    ("Jun 14", "9:00 PM",  "F", "UEFA Play-off B", "Tunisia",            1, "Monterrey"),
    # Group G
    ("Jun 15", "3:00 PM",  "G", "Belgium",         "Egypt",              1, "Seattle"),
    ("Jun 15", "9:00 PM",  "G", "Iran",            "New Zealand",        1, "Los Angeles"),
    # Group H
    ("Jun 15", "12:00 PM", "H", "Spain",           "Cape Verde",         1, "Atlanta"),
    ("Jun 15", "6:00 PM",  "H", "Saudi Arabia",    "Uruguay",            1, "Miami"),
    # Group I
    ("Jun 16", "3:00 PM",  "I", "France",          "Senegal",            1, "New York/New Jersey"),
    ("Jun 16", "6:00 PM",  "I", "FIFA Play-off 2", "Norway",             1, "Boston"),
    # Group J
    ("Jun 16", "9:00 PM",  "J", "Argentina",       "Algeria",            1, "Kansas City"),
    ("Jun 17", "12:00 AM", "J", "Austria",         "Jordan",             1, "San Francisco Bay Area"),
    # Group K
    ("Jun 17", "1:00 PM",  "K", "Portugal",        "FIFA Play-off 1",    1, "Houston"),
    ("Jun 17", "10:00 PM", "K", "Uzbekistan",      "Colombia",           1, "Mexico City"),
    # Group L
    ("Jun 17", "4:00 PM",  "L", "England",         "Croatia",            1, "Dallas"),
    ("Jun 17", "7:00 PM",  "L", "Ghana",           "Panama",             1, "Toronto"),

    # ==================== MATCHDAY 2 ====================
    # Group A
    ("Jun 18", "12:00 PM", "A", "UEFA Play-off D", "South Africa",       2, "Atlanta"),
    ("Jun 18", "9:00 PM",  "A", "Mexico",          "South Korea",        2, "Guadalajara"),
    # Group B
    ("Jun 18", "3:00 PM",  "B", "Switzerland",     "UEFA Play-off A",    2, "Los Angeles"),
    ("Jun 18", "9:00 PM",  "B", "Canada",          "Qatar",              2, "Vancouver"),
    # Group C
    ("Jun 19", "6:00 PM",  "C", "Scotland",        "Morocco",            2, "Boston"),
    ("Jun 19", "9:00 PM",  "C", "Brazil",          "Haiti",              2, "Philadelphia"),
    # Group D
    ("Jun 19", "3:00 PM",  "D", "United States",   "Australia",          2, "Seattle"),
    ("Jun 19", "9:00 PM",  "D", "UEFA Play-off C", "Paraguay",           2, "San Francisco Bay Area"),
    # Group E
    ("Jun 20", "4:00 PM",  "E", "Germany",         "Ivory Coast",        2, "Toronto"),
    ("Jun 20", "8:00 PM",  "E", "Ecuador",         "Curacao",            2, "Kansas City"),
    # Group F
    ("Jun 20", "1:00 PM",  "F", "Netherlands",     "UEFA Play-off B",    2, "Houston"),
    ("Jun 21", "12:00 AM", "F", "Tunisia",         "Japan",              2, "Monterrey"),
    # Group G
    ("Jun 21", "3:00 PM",  "G", "Belgium",         "Iran",               2, "Los Angeles"),
    ("Jun 21", "9:00 PM",  "G", "New Zealand",     "Egypt",              2, "Vancouver"),
    # Group H
    ("Jun 21", "12:00 PM", "H", "Spain",           "Saudi Arabia",       2, "Atlanta"),
    ("Jun 21", "6:00 PM",  "H", "Uruguay",         "Cape Verde",         2, "Miami"),
    # Group I
    ("Jun 22", "5:00 PM",  "I", "France",          "FIFA Play-off 2",    2, "Philadelphia"),
    ("Jun 22", "8:00 PM",  "I", "Norway",          "Senegal",            2, "New York/New Jersey"),
    # Group J
    ("Jun 22", "1:00 PM",  "J", "Argentina",       "Austria",            2, "Dallas"),
    ("Jun 22", "11:00 PM", "J", "Jordan",          "Algeria",            2, "San Francisco Bay Area"),
    # Group K
    ("Jun 23", "1:00 PM",  "K", "Portugal",        "Uzbekistan",         2, "Houston"),
    ("Jun 23", "10:00 PM", "K", "Colombia",        "FIFA Play-off 1",    2, "Guadalajara"),
    # Group L
    ("Jun 23", "4:00 PM",  "L", "England",         "Ghana",              2, "Boston"),
    ("Jun 23", "7:00 PM",  "L", "Panama",          "Croatia",            2, "Toronto"),

    # ==================== MATCHDAY 3 (simultaneous within each group) ====================
    # Group A
    ("Jun 24", "9:00 PM",  "A", "UEFA Play-off D", "Mexico",             3, "Mexico City"),
    ("Jun 24", "9:00 PM",  "A", "South Africa",    "South Korea",        3, "Monterrey"),
    # Group B
    ("Jun 24", "9:00 PM",  "B", "Switzerland",     "Canada",             3, "Vancouver"),
    ("Jun 24", "3:00 PM",  "B", "UEFA Play-off A", "Qatar",              3, "Seattle"),
    # Group C
    ("Jun 24", "6:00 PM",  "C", "Scotland",        "Brazil",             3, "Miami"),
    ("Jun 24", "6:00 PM",  "C", "Morocco",         "Haiti",              3, "Atlanta"),
    # Group D
    ("Jun 25", "10:00 PM", "D", "UEFA Play-off C", "United States",      3, "Los Angeles"),
    ("Jun 25", "10:00 PM", "D", "Paraguay",        "Australia",          3, "San Francisco Bay Area"),
    # Group E
    ("Jun 25", "4:00 PM",  "E", "Ecuador",         "Germany",            3, "New York/New Jersey"),
    ("Jun 25", "4:00 PM",  "E", "Curacao",         "Ivory Coast",        3, "Philadelphia"),
    # Group F
    ("Jun 25", "7:00 PM",  "F", "Japan",           "UEFA Play-off B",    3, "Dallas"),
    ("Jun 25", "7:00 PM",  "F", "Tunisia",         "Netherlands",        3, "Kansas City"),
    # Group G
    ("Jun 26", "11:00 PM", "G", "Egypt",           "Iran",               3, "Seattle"),
    ("Jun 26", "11:00 PM", "G", "New Zealand",     "Belgium",            3, "Vancouver"),
    # Group H
    ("Jun 26", "8:00 PM",  "H", "Cape Verde",      "Saudi Arabia",       3, "Houston"),
    ("Jun 26", "8:00 PM",  "H", "Uruguay",         "Spain",              3, "Guadalajara"),
    # Group I
    ("Jun 26", "3:00 PM",  "I", "Norway",          "France",             3, "Boston"),
    ("Jun 26", "3:00 PM",  "I", "Senegal",         "FIFA Play-off 2",    3, "Toronto"),
    # Group J
    ("Jun 27", "10:00 PM", "J", "Algeria",         "Austria",            3, "Kansas City"),
    ("Jun 27", "10:00 PM", "J", "Jordan",          "Argentina",          3, "Dallas"),
    # Group K
    ("Jun 27", "7:00 PM",  "K", "Colombia",        "Portugal",           3, "Miami"),
    ("Jun 27", "7:00 PM",  "K", "FIFA Play-off 1", "Uzbekistan",         3, "Atlanta"),
    # Group L
    ("Jun 27", "5:00 PM",  "L", "Panama",          "England",            3, "New York/New Jersey"),
    ("Jun 27", "5:00 PM",  "L", "Croatia",         "Ghana",              3, "Philadelphia"),
]

def main():
    fixtures = []
    # Track per-group sequence for stable match IDs
    group_seq: dict[str, int] = {}
    for date_str, time_str, group, home, away, matchday, venue in RAW_MATCHES:
        group_seq[group] = group_seq.get(group, 0) + 1
        match_id = f"wc2026_g_{group}{group_seq[group]:02d}"
        fixtures.append({
            "match_id": match_id,
            "home": normalize(home),
            "away": normalize(away),
            "kickoff_ts": ts(date_str, time_str),
            "group": group,
            "matchday": matchday,
            "venue": venue,
            "stage": "group",
        })

    # Sanity checks
    assert len(fixtures) == 72, f"expected 72 matches, got {len(fixtures)}"
    assert len({f["match_id"] for f in fixtures}) == 72, "duplicate match_id"
    for g in "ABCDEFGHIJKL":
        group_matches = [f for f in fixtures if f["group"] == g]
        assert len(group_matches) == 6, f"group {g} has {len(group_matches)} matches, expected 6"

    # Sort by kickoff for readability
    fixtures.sort(key=lambda f: f["kickoff_ts"])

    with open("fixtures.json", "w") as fh:
        json.dump(fixtures, fh, indent=2)

    print(f"Generated fixtures.json with {len(fixtures)} matches")
    print(f"First kickoff:  {datetime.fromtimestamp(fixtures[0]['kickoff_ts'], tz=timezone.utc).isoformat()}")
    print(f"Last kickoff:   {datetime.fromtimestamp(fixtures[-1]['kickoff_ts'], tz=timezone.utc).isoformat()}")

if __name__ == "__main__":
    main()
