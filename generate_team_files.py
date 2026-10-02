"""
Team File Generator
===================
For each selected synthetic_master.csv, generates:

  1. 8 per-team round1 public CSVs
       - 850 rows: 800 training + 50 prediction rows
       - LOCAL timestamps 1-850 (restart per team)
       - target column is EMPTY for rows 801-850 (prediction rows)
       - secret columns (regime, flash_crash_day, next_return) stripped out

  2. A complete master_validation.csv covering ALL 8 team prediction windows
       - 400 rows per stock (8 teams x 50 rows)
       - Columns: team_id, stock_id, master_timestamp, local_timestamp, target, next_return
       - Backend uses this to score team submissions

Team window assignment (matches spec.md Section 2):
  Team 01: train rows 1-800,   predict rows 801-850   (master)
  Team 02: train rows 101-900, predict rows 901-950
  ...
  Team 08: train rows 701-1500, predict rows 1501-1550

  All windows are applied to the AVAILABLE rows in the master CSV
  (after NaN warmup rows are dropped), using 0-based positional indexing.

Usage:
  python generate_team_files.py --input ./datasets --output ./team_files

  Or for a single stock:
  python generate_team_files.py --input ./datasets --stock CHRP --output ./team_files
"""

import argparse
import os
from pathlib import Path

import pandas as pd

# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────

TEAMS_PER_STOCK = 8
TRAIN_ROWS      = 800   # rows per training window
PREDICT_ROWS    = 50    # rows per prediction window per round
WINDOW_OFFSET   = 100   # each successive team starts 100 rows later

# Columns that must NEVER appear in participant files
SECRET_COLS = {"regime", "flash_crash_day", "next_return", "target"}

# Ordered public columns (others kept if not secret)
PUBLIC_COLS_ORDER = [
    "timestamp", "date", "asset_id",
    "open", "high", "low", "close", "volume",
    "return_1d", "sma_10", "sma_30", "momentum_5",
    "volatility_20", "rsi_14", "volume_z_20", "order_flow",
]


# ─────────────────────────────────────────────────────────────
# TEAM WINDOW DEFINITIONS
# ─────────────────────────────────────────────────────────────

def team_windows(stock_prefix: str) -> list:
    """
    Returns list of dicts describing each team's window.
    train_start / train_end / predict_start / predict_end are 0-based
    positional indices into the available (non-NaN) master rows.
    """
    windows = []
    for i in range(TEAMS_PER_STOCK):
        train_s  = i * WINDOW_OFFSET
        train_e  = train_s + TRAIN_ROWS          # exclusive
        pred_s   = train_e
        pred_e   = pred_s + PREDICT_ROWS         # exclusive
        team_id  = f"{stock_prefix}{i+1:02d}"
        windows.append({
            "team_id":   team_id,
            "train_s":   train_s,
            "train_e":   train_e,
            "pred_s":    pred_s,
            "pred_e":    pred_e,
        })
    return windows


# ─────────────────────────────────────────────────────────────
# GENERATORS
# ─────────────────────────────────────────────────────────────

def generate_team_public(
    master: pd.DataFrame,
    window: dict,
    stock_id: str,
    out_dir: Path,
) -> None:
    """
    Generate one team's round1 public CSV.
    850 rows: training rows have target filled, prediction rows have target empty.
    All timestamps are LOCAL (1 to 850).
    """
    train_rows   = master.iloc[window["train_s"]: window["train_e"]].copy()
    predict_rows = master.iloc[window["pred_s"]:  window["pred_e"]].copy()

    # Build team CSV — training rows keep target
    train_rows   = train_rows.copy()
    predict_rows = predict_rows.copy()

    # Blank out target for prediction rows (that's what teams are predicting!)
    if "target" in predict_rows.columns:
        predict_rows["target"] = ""

    combined = pd.concat([train_rows, predict_rows], ignore_index=True)

    # Assign LOCAL timestamps (1 to 850)
    combined["timestamp"] = range(1, len(combined) + 1)
    combined["asset_id"]  = stock_id

    # Keep public columns + target (for training rows), drop all other secrets
    keep_cols = [c for c in PUBLIC_COLS_ORDER if c in combined.columns]
    if "target" in combined.columns:
        keep_cols.append("target")
    # Drop remaining secrets
    for secret in SECRET_COLS - {"target"}:
        if secret in combined.columns:
            combined = combined.drop(columns=[secret])

    combined = combined[keep_cols]

    # Round floats
    float_cols = combined.select_dtypes(include="float").columns
    combined[float_cols] = combined[float_cols].round(4)

    fname = out_dir / f"{stock_id}_{window['team_id']}_round1.csv"
    combined.to_csv(fname, index=False)
    print(f"      {fname.name}  ({len(combined)} rows: {TRAIN_ROWS} train + {PREDICT_ROWS} predict)")


def generate_validation_rows(
    master: pd.DataFrame,
    window: dict,
    stock_id: str,
) -> pd.DataFrame:
    """
    Returns 50 validation rows for this team's prediction window.
    """
    pred_rows = master.iloc[window["pred_s"]: window["pred_e"]].copy()

    if len(pred_rows) < PREDICT_ROWS:
        raise ValueError(
            f"Team {window['team_id']}: prediction window needs {PREDICT_ROWS} rows "
            f"but master only has {len(pred_rows)} rows available at that position. "
            f"Master is too short — need at least {window['pred_e']} available rows."
        )

    # master_timestamp = the original timestamp value in the master
    result = pd.DataFrame({
        "team_id":         window["team_id"],
        "stock_id":        stock_id,
        "master_timestamp": pred_rows["timestamp"].values,
        "local_timestamp": range(801, 801 + PREDICT_ROWS),
        "date":            pred_rows["date"].values if "date" in pred_rows.columns else "",
        "target":          pred_rows["target"].values if "target" in pred_rows.columns else None,
        "next_return":     pred_rows["next_return"].values if "next_return" in pred_rows.columns else None,
    })
    return result


def process_stock(
    master_path: Path,
    stock_id: str,
    stock_prefix: str,
    out_dir: Path,
) -> None:
    print(f"\n  [{stock_id}]  source: {master_path.name}")

    master = pd.read_csv(master_path)

    # Validate minimum length
    min_rows_needed = WINDOW_OFFSET * (TEAMS_PER_STOCK - 1) + TRAIN_ROWS + PREDICT_ROWS
    if len(master) < min_rows_needed:
        print(f"    ERROR: master has {len(master)} rows but needs >= {min_rows_needed}. Skipping.")
        return

    windows  = team_windows(stock_prefix)
    val_rows = []

    team_dir = out_dir / stock_id
    team_dir.mkdir(parents=True, exist_ok=True)

    print(f"    Generating {TEAMS_PER_STOCK} team files...")
    for w in windows:
        try:
            generate_team_public(master, w, stock_id, team_dir)
            val_rows.append(generate_validation_rows(master, w, stock_id))
        except ValueError as e:
            print(f"      WARN: {e}")

    # Save master_validation.csv for this stock
    if val_rows:
        val_df = pd.concat(val_rows, ignore_index=True)
        # Round floats
        for col in ["target", "next_return"]:
            if col in val_df.columns:
                val_df[col] = pd.to_numeric(val_df[col], errors="coerce").round(6)
        val_path = team_dir / f"{stock_id}_master_validation.csv"
        val_df.to_csv(val_path, index=False)
        print(f"\n    Saved master_validation: {val_path.name}  ({len(val_df)} rows = {TEAMS_PER_STOCK} teams x {PREDICT_ROWS} rows)")
        print(f"    Preview:")
        print(val_df[["team_id", "stock_id", "master_timestamp", "local_timestamp", "target"]].to_string(index=False, max_rows=6))


# ─────────────────────────────────────────────────────────────
# FILE DISCOVERY
# ─────────────────────────────────────────────────────────────

def find_masters(input_dir: Path, target_stock: str = None) -> list:
    """Find all *_synthetic_master.csv files in input_dir."""
    found = []
    for f in sorted(input_dir.iterdir()):
        if ".bak." in f.name or not f.suffix == ".csv":
            continue
        if "_synthetic_master" not in f.stem:
            continue
        stock_id = f.stem.replace("_synthetic_master", "")
        if target_stock and stock_id.lower() != target_stock.lower():
            continue
        found.append((stock_id, f))
    return found


def stock_prefix_for(stock_id: str, index: int) -> str:
    """
    Map stock name to a short letter prefix for team codes.
    e.g. CHRP -> 'C', AERION_X -> 'A', or fallback to index letter.
    """
    letter = stock_id[0].upper() if stock_id else "X"
    # Use index to avoid collisions (two stocks starting with same letter)
    # Fall back to A, B, C, D, E, F, G...
    return chr(ord("A") + index)


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate per-team round1 CSVs and master_validation.csv from synthetic master files."
    )
    parser.add_argument(
        "--input", "-i",
        type=Path,
        default=Path("./datasets"),
        help="Directory containing *_synthetic_master.csv files (default: ./datasets)"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=Path("./team_files"),
        help="Output directory for team files (default: ./team_files)"
    )
    parser.add_argument(
        "--stock",
        type=str,
        default=None,
        help="Process only this stock (e.g. --stock CHRP). Default: all stocks."
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: '{args.input}' does not exist.")
        return

    masters = find_masters(args.input, args.stock)
    if not masters:
        print(f"No *_synthetic_master.csv files found in '{args.input}'.")
        return

    args.output.mkdir(parents=True, exist_ok=True)

    print(f"\nGenerating team files for {len(masters)} stock(s)...")
    print(f"Output directory: {args.output}/")
    print("=" * 60)

    for idx, (stock_id, master_path) in enumerate(masters):
        prefix = stock_prefix_for(stock_id, idx)
        process_stock(master_path, stock_id, prefix, args.output)

    print(f"\n{'=' * 60}")
    print("Done.\n")
    print("Output structure:")
    print("  team_files/")
    for stock_id, _ in masters:
        print(f"    {stock_id}/")
        print(f"      {stock_id}_master_validation.csv   <- backend answer key (400 rows)")
        print(f"      {stock_id}_A01_round1.csv          <- team A01's public data")
        print(f"      {stock_id}_A02_round1.csv          <- team A02's public data")
        print(f"      ... (8 team files per stock)")


if __name__ == "__main__":
    main()
