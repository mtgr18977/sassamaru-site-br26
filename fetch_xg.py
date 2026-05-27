"""
fetch_xg.py — Enrich campeonato-brasileiro-limpo.csv with FBref xG data.

Fetches expected-goals (xG) per match for Brasileirão Série A seasons 2021–2025
from FBref and produces campeonatobrasileirolimpo_xg.csv.

Usage (from repo root):
    pip install soccerdata pandas --break-system-packages
    python fetch_xg.py

Soccerdata setup note:
    soccerdata 1.9+ does NOT include BRA-Serie A in its default league dict.
    Before using the soccerdata path, create the custom league config:

        mkdir -p ~/soccerdata/config
        cat > ~/soccerdata/config/league_dict.json <<'EOF'
        {
          "BRA-Serie A": {
            "FBref": "Serie A",
            "season_start": "Apr",
            "season_end": "Dec"
          }
        }
        EOF

    The soccerdata FBref reader also requires Chrome/Selenium to bypass
    bot-detection. Install Chrome and ensure chromedriver is on PATH.

    This script falls back to direct HTTP requests automatically if soccerdata
    is unavailable or Chrome is not installed.

Caching:
    soccerdata caches to ~/.soccerdata/data/FBref/ automatically.
    Direct-requests mode caches HTML to /tmp/fbref_cache/.
"""

import csv
import io
import os
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent
LIMPO_CSV = REPO_ROOT / "datasets" / "campeonato-brasileiro-limpo.csv"
FULL_CSV = REPO_ROOT / "datasets" / "campeonato-brasileiro-full_ate_2025.csv"
OUTPUT_CSV = REPO_ROOT / "campeonatobrasileirolimpo_xg.csv"
CACHE_DIR = Path("/tmp/fbref_cache")

SEASONS = range(2021, 2026)  # 2021 through 2025 inclusive

# ---------------------------------------------------------------------------
# Team-name normalisation (mirrors model.js normalizeTeam)
# ---------------------------------------------------------------------------

_ALIASES = {
    # CSV variants → canonical
    "atletico mg": "atletico mineiro",
    "atletico mineiro mg": "atletico mineiro",
    "athletico pr": "athletico paranaense",
    "botafogo rj": "botafogo",
    "botafogo fr": "botafogo",
    "america mg": "america mineiro",
    "atletico go": "atletico goianiense",
    "ceara sc": "ceara",
    "ec juventude": "juventude",
    "fluminense fc": "fluminense",
    "fortaleza esporte clube": "fortaleza",
    "red bull bragantino sp": "red bull bragantino",
    "bragantino": "red bull bragantino",
    "sc internacional": "internacional",
    "santos fc": "santos",
    "mirassol futebol clube": "mirassol",
    # FBref variants → canonical
    "vasco da gama": "vasco",
    "athetico parananese": "athletico paranaense",  # typo guard from model.js
    "clube atletico mineiro": "atletico mineiro",
    "red bull bragantino": "red bull bragantino",  # keep as-is (already canonical)
    "america mineiro": "america mineiro",           # keep as-is
    "atletico goianiense": "atletico goianiense",   # keep as-is
    "criciuma": "criciuma",
    "vitoria": "vitoria",
}


def normalize_team(name: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace, apply alias map."""
    if not name:
        return ""
    s = str(name).strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("-", " ")
    s = " ".join(s.split())
    return _ALIASES.get(s, s)


# ---------------------------------------------------------------------------
# Date parsing helpers
# ---------------------------------------------------------------------------

def parse_date_br(s: str):
    """Parse dd/mm/yyyy or yyyy-mm-dd strings. Returns datetime or None."""
    s = str(s).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------------------
# Load original CSV and attach season year via the full dataset
# ---------------------------------------------------------------------------

def load_limpo_with_years() -> pd.DataFrame:
    """
    Load campeonato-brasileiro-limpo.csv and attach a `year` column derived
    from campeonato-brasileiro-full_ate_2025.csv (which carries match dates).
    Rows with ID > max(full) are 2026 matches → year = 2026.
    """
    limpo = pd.read_csv(LIMPO_CSV)
    full = pd.read_csv(FULL_CSV, usecols=["ID", "data"])

    full["year"] = full["data"].apply(lambda d: (parse_date_br(d) or datetime(1900, 1, 1)).year)
    full = full[["ID", "year"]]

    df = limpo.merge(full, on="ID", how="left")
    # Rows beyond full dataset are 2026 Série A rounds
    df["year"] = df["year"].fillna(2026).astype(int)
    return df


# ---------------------------------------------------------------------------
# FBref fetching — approach A: soccerdata (preferred, needs Chrome)
# ---------------------------------------------------------------------------

def fetch_xg_soccerdata() -> pd.DataFrame:
    """
    Use soccerdata.FBref.read_schedule() to pull xG for all seasons.

    Returns a DataFrame with columns:
        home_norm, away_norm, home_xg, away_xg, date, season_year

    Raises ImportError if soccerdata is unavailable,
    RuntimeError if Chrome/selenium is unavailable.

    Note: soccerdata's FBref reader uses Selenium (Chrome) to bypass bot
    detection. Chrome must be installed and accessible.
    """
    import soccerdata as sd

    print("[soccerdata] Fetching FBref schedule for seasons", list(SEASONS), "...")
    fbref = sd.FBref(leagues="BRA-Serie A", seasons=list(SEASONS))
    schedule = fbref.read_schedule()
    print("[soccerdata] Columns:", schedule.columns.tolist())
    print("[soccerdata] Shape:", schedule.shape)

    # Rename xG columns if they exist under alternate names
    col_map = {}
    for c in schedule.columns:
        lc = c.lower()
        if lc in ("xg", "home_xg", "xg_home"):
            col_map[c] = "home_xg"
        elif lc in ("xg.1", "away_xg", "xg_away"):
            col_map[c] = "away_xg"
        elif lc in ("home", "home_team"):
            col_map[c] = "home_team"
        elif lc in ("away", "away_team"):
            col_map[c] = "away_team"
    schedule = schedule.rename(columns=col_map)

    if "home_xg" not in schedule.columns:
        raise ValueError(
            "xG columns not found in schedule. "
            f"Available: {schedule.columns.tolist()}"
        )

    schedule["home_norm"] = schedule["home_team"].apply(normalize_team)
    schedule["away_norm"] = schedule["away_team"].apply(normalize_team)

    # Extract season year from the multi-level index or date
    if "date" in schedule.columns:
        schedule["season_year"] = pd.to_datetime(schedule["date"], errors="coerce").dt.year
    else:
        schedule["season_year"] = schedule.index.get_level_values("season") if "season" in schedule.index.names else None

    return schedule[["home_norm", "away_norm", "home_xg", "away_xg", "season_year"]].copy()


# ---------------------------------------------------------------------------
# FBref fetching — approach B: direct HTTP requests (no Selenium)
# ---------------------------------------------------------------------------

FBREF_BASE = "https://fbref.com"
FBREF_SCHEDULE_URL = (
    FBREF_BASE + "/en/comps/24/{year}/schedule/{year}-Serie-A-Scores-and-Fixtures"
)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://fbref.com/",
}


def _fetch_season_html(year: int, session) -> str:
    """Fetch raw HTML for a single season's fixture page; cache to /tmp."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"fbref_serie_a_{year}.html"
    if cache_file.exists():
        print(f"  [cache] Using cached {cache_file.name}")
        return cache_file.read_text(encoding="utf-8")

    url = FBREF_SCHEDULE_URL.format(year=year)
    print(f"  [http]  GET {url}")
    resp = session.get(url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text
    cache_file.write_text(html, encoding="utf-8")
    return html


def _parse_schedule_html(html: str, year: int) -> pd.DataFrame:
    """
    Parse an FBref schedule HTML page and return a DataFrame with:
        home_norm, away_norm, home_xg, away_xg, season_year
    """
    tables = pd.read_html(io.StringIO(html), attrs={"id": lambda s: s and "sched" in s})
    if not tables:
        raise ValueError(f"No schedule table found in HTML for {year}")
    df = tables[0]

    # FBref uses multi-level columns; flatten
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ["_".join(filter(None, map(str, c))).strip() for c in df.columns]

    # Identify relevant columns (case-insensitive substring match)
    def find_col(df, *candidates):
        for c in df.columns:
            if any(cand.lower() in c.lower() for cand in candidates):
                return c
        return None

    home_col = find_col(df, "Home", "home_team")
    away_col = find_col(df, "Away", "away_team")
    xg_cols = [c for c in df.columns if "xg" in c.lower() or "xG" in c]

    if home_col is None or away_col is None:
        raise ValueError(
            f"Could not identify home/away columns for {year}. "
            f"Columns: {df.columns.tolist()}"
        )

    # FBref puts home xG as the first xG column and away as second
    home_xg_col = xg_cols[0] if len(xg_cols) >= 1 else None
    away_xg_col = xg_cols[1] if len(xg_cols) >= 2 else None

    if home_xg_col is None:
        print(f"  [warn] No xG columns found for {year}; columns: {df.columns.tolist()}")

    result = pd.DataFrame()
    result["home_team"] = df[home_col]
    result["away_team"] = df[away_col]
    result["home_xg"] = pd.to_numeric(df[home_xg_col], errors="coerce") if home_xg_col else float("nan")
    result["away_xg"] = pd.to_numeric(df[away_xg_col], errors="coerce") if away_xg_col else float("nan")
    result["season_year"] = year

    # Drop rows that are headers repeated mid-table or empty
    result = result.dropna(subset=["home_team", "away_team"])
    result = result[result["home_team"] != "Home"]

    result["home_norm"] = result["home_team"].apply(normalize_team)
    result["away_norm"] = result["away_team"].apply(normalize_team)

    return result[["home_norm", "away_norm", "home_xg", "away_xg", "season_year"]]


def fetch_xg_direct() -> pd.DataFrame:
    """
    Fetch FBref xG data via direct HTTP requests (no Selenium).
    Respects a 3-second inter-request delay per FBref's robots.txt spirit.
    """
    import requests as req

    session = req.Session()
    all_dfs = []

    for i, year in enumerate(SEASONS):
        if i > 0:
            time.sleep(3)
        print(f"[direct] Season {year} ...")
        try:
            html = _fetch_season_html(year, session)
            df = _parse_schedule_html(html, year)
            print(f"  → {len(df)} rows, xG null: {df['home_xg'].isna().sum()}")
            all_dfs.append(df)
        except Exception as e:
            print(f"  [error] Season {year}: {e}")

    if not all_dfs:
        return pd.DataFrame(columns=["home_norm", "away_norm", "home_xg", "away_xg", "season_year"])
    return pd.concat(all_dfs, ignore_index=True)


# ---------------------------------------------------------------------------
# Main join logic
# ---------------------------------------------------------------------------

def build_xg_lookup(fbref_df: pd.DataFrame) -> dict:
    """
    Build a lookup dict keyed by (home_norm, away_norm, season_year) → (home_xg, away_xg).
    When multiple rows match (replayed/voided matches), keep the first non-null pair.
    """
    lookup = {}
    for _, row in fbref_df.iterrows():
        key = (row["home_norm"], row["away_norm"], int(row["season_year"]))
        if key not in lookup or (
            pd.isna(lookup[key][0]) and not pd.isna(row["home_xg"])
        ):
            lookup[key] = (row["home_xg"], row["away_xg"])
    return lookup


def enrich(df: pd.DataFrame, lookup: dict) -> pd.DataFrame:
    """
    Left-join xG data into df via a vectorised merge.
    Only rows whose year falls in SEASONS get a lookup attempt;
    rows outside that window and unmatched rows receive NaN.

    Known edge case: The 2020 Série A final rounds were played in Jan–Feb 2021
    (COVID delay), so those matches have year=2021. They share some home/away
    pairings with the actual 2021 season, leading to a few duplicated xG values.
    These are accepted for research/backtest purposes.
    """
    df = df.copy()
    df["home_norm"] = df["mandante"].apply(normalize_team)
    df["away_norm"] = df["visitante"].apply(normalize_team)

    # Build a lookup DataFrame for an efficient merge
    if lookup:
        lu_rows = [
            {"home_norm": h, "away_norm": a, "year": y, "xg_mandante": hx, "xg_visitante": ax}
            for (h, a, y), (hx, ax) in lookup.items()
        ]
        lu_df = pd.DataFrame(lu_rows)
        lu_df["year"] = lu_df["year"].astype(int)
    else:
        lu_df = pd.DataFrame(columns=["home_norm", "away_norm", "year", "xg_mandante", "xg_visitante"])

    # Only attempt match for rows inside SEASONS; keep year column for merge key
    in_window = df["year"].isin(SEASONS)
    df_window = df.loc[in_window].merge(lu_df, on=["home_norm", "away_norm", "year"], how="left")

    # Re-attach matched xG to the full DataFrame by index
    df["xg_mandante"] = pd.array([float("nan")] * len(df), dtype="Float64")
    df["xg_visitante"] = pd.array([float("nan")] * len(df), dtype="Float64")
    if in_window.any():
        df.loc[in_window, "xg_mandante"] = pd.array(
            df_window["xg_mandante"].values, dtype="Float64"
        )
        df.loc[in_window, "xg_visitante"] = pd.array(
            df_window["xg_visitante"].values, dtype="Float64"
        )

    df = df.drop(columns=["home_norm", "away_norm", "year"])
    return df


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(original: pd.DataFrame, result: pd.DataFrame) -> None:
    assert len(result) == len(original), (
        f"Row count changed: original={len(original)}, result={len(result)}"
    )
    assert "xg_mandante" in result.columns, "Missing column: xg_mandante"
    assert "xg_visitante" in result.columns, "Missing column: xg_visitante"

    xg_home = result["xg_mandante"].dropna()
    xg_away = result["xg_visitante"].dropna()
    if len(xg_home) > 0:
        assert (xg_home >= 0).all(), "Negative xG values in xg_mandante"
        assert (xg_away >= 0).all(), "Negative xG values in xg_visitante"

    print("[validate] All assertions passed.")


# ---------------------------------------------------------------------------
# Summary report
# ---------------------------------------------------------------------------

def print_summary(original: pd.DataFrame, result: pd.DataFrame) -> None:
    total = len(result)
    matched = result["xg_mandante"].notna().sum()
    missing = total - matched
    xg_h_mean = result["xg_mandante"].mean()
    xg_a_mean = result["xg_visitante"].mean()

    print("\n" + "=" * 60)
    print("  XG ENRICHMENT SUMMARY")
    print("=" * 60)
    print(f"  Total rows              : {total}")
    print(f"  Rows WITH xG (matched)  : {matched}")
    print(f"  Rows WITHOUT xG (NaN)   : {missing}")
    if matched > 0:
        print(f"  Mean xG home (matched)  : {xg_h_mean:.4f}")
        print(f"  Mean xG away (matched)  : {xg_a_mean:.4f}")
    else:
        print("  Mean xG home (matched)  : N/A (no matched rows)")
        print("  Mean xG away (matched)  : N/A (no matched rows)")
    print(f"\n  Output written to       : {OUTPUT_CSV}")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    print("Loading source CSV ...")
    df_with_years = load_limpo_with_years()
    original = pd.read_csv(LIMPO_CSV)
    print(f"  {len(df_with_years)} rows loaded.")

    # --- Fetch FBref xG (try soccerdata first, fall back to direct requests) ---
    fbref_df = None

    print("\nFetching FBref xG data ...")

    # Attempt 1: soccerdata (needs Chrome + soccerdata installed)
    try:
        fbref_df = fetch_xg_soccerdata()
        print(f"  [soccerdata] OK — {len(fbref_df)} rows from FBref")
    except ImportError:
        print("  [soccerdata] Not available (ImportError). Trying direct requests ...")
    except Exception as e:
        print(f"  [soccerdata] Failed: {e}. Trying direct requests ...")

    # Attempt 2: direct HTTP to FBref
    if fbref_df is None:
        try:
            fbref_df = fetch_xg_direct()
            print(f"  [direct] OK — {len(fbref_df)} rows from FBref")
        except Exception as e:
            print(f"  [direct] Failed: {e}")
            print(
                "\n  NOTE: FBref is not reachable from this environment.\n"
                "  The enriched CSV will be written with NaN xG columns.\n"
                "  Run this script from a machine with fbref.com access to get real xG data."
            )
            fbref_df = pd.DataFrame(
                columns=["home_norm", "away_norm", "home_xg", "away_xg", "season_year"]
            )

    # --- Build lookup and join ---
    print("\nBuilding xG lookup table ...")
    lookup = build_xg_lookup(fbref_df)
    print(f"  {len(lookup)} unique (home, away, year) keys in FBref data")

    print("Joining xG into source CSV ...")
    result = enrich(df_with_years, lookup)

    # --- Validate ---
    validate(original, result)

    # --- Output ---
    result.to_csv(OUTPUT_CSV, index=False)

    # --- Summary ---
    print_summary(original, result)


if __name__ == "__main__":
    main()
