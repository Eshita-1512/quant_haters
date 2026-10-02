"""
Dataset Preparator
==================
Patches council member datasets before scoring:

1. Adds `flash_crash_day` column (1 on the first regime=1 day, 0 everywhere else)
2. Generates missing `round1_public.csv` by removing secret columns from master

Run this BEFORE running dataset_scorer.py:
    python dataset_prep.py --input ./datasets

It edits the files in-place (originals are backed up as *.bak.csv).
"""

import argparse
import shutil
from pathlib import Path

import pandas as pd

# Secret columns that must NOT appear in the public file
SECRET_COLS = {"regime", "flash_crash_day", "next_return", "target"}

PUBLIC_COLS_ORDER = [
    "timestamp", "date", "asset_id",
    "open", "high", "low", "close", "volume",
    "return_1d", "sma_10", "sma_30", "momentum_5",
    "volatility_20", "rsi_14", "volume_z_20", "order_flow",
]


def add_flash_crash_day(df: pd.DataFrame) -> pd.DataFrame:
    """Add flash_crash_day = 1 on the first row where regime switches to 1."""
    if "flash_crash_day" in df.columns:
        print("    flash_crash_day already exists, skipping.")
        return df

    if "regime" not in df.columns:
        print("    WARNING: no regime column — cannot add flash_crash_day.")
        return df

    df = df.sort_values("timestamp").reset_index(drop=True)
    df["flash_crash_day"] = 0

    # First day where regime == 1
    crash_mask = df["regime"] == 1
    if crash_mask.any():
        first_crash_idx = crash_mask.idxmax()  # index of first True
        df.loc[first_crash_idx, "flash_crash_day"] = 1
        crash_ts = df.loc[first_crash_idx, "timestamp"]
        crash_ret = df.loc[first_crash_idx, "return_1d"] if "return_1d" in df.columns else "N/A"
        print(f"    flash_crash_day=1 set at timestamp={crash_ts}  (return_1d={crash_ret})")
    else:
        print("    WARNING: no regime=1 rows found — flash_crash_day stays all 0.")

    return df


def generate_public(df: pd.DataFrame, public_path: Path) -> None:
    """Generate round1_public.csv by keeping only non-secret columns."""
    available = [c for c in PUBLIC_COLS_ORDER if c in df.columns]
    extra = [c for c in df.columns if c not in SECRET_COLS and c not in PUBLIC_COLS_ORDER]
    final_cols = available + extra  # keep any extra non-secret cols the member added

    df_public = df[final_cols].copy()
    df_public.to_csv(public_path, index=False)
    print(f"    Generated public file: {public_path.name}  ({len(df_public)} rows, {len(final_cols)} cols)")


def prep_dataset(member_name: str, master_path: Path, public_path: Path) -> None:
    print(f"\n  [{member_name}]")

    # Load master
    df = pd.read_csv(master_path)
    print(f"    Loaded master: {master_path.name}  ({len(df)} rows)")

    # 1. Add flash_crash_day if missing
    df_patched = add_flash_crash_day(df)

    # Save patched master (backup original first)
    if "flash_crash_day" not in df.columns:
        backup = master_path.with_suffix(".bak.csv")
        shutil.copy2(master_path, backup)
        df_patched.to_csv(master_path, index=False)
        print(f"    Master saved (original backed up as {backup.name})")

    # 2. Generate public file if missing
    if not public_path.exists():
        generate_public(df_patched, public_path)
    else:
        print(f"    round1_public already exists, skipping.")


def main():
    parser = argparse.ArgumentParser(
        description="Patch council member datasets: add flash_crash_day + generate public CSVs."
    )
    parser.add_argument(
        "--input", "-i",
        type=Path,
        default=Path("./datasets"),
        help="Directory containing submitted dataset files (default: ./datasets)"
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: '{args.input}' does not exist.")
        return

    print(f"\nScanning '{args.input}' for synthetic_master files...")

    members = {}
    for f in sorted(args.input.iterdir()):
        if f.suffix.lower() != ".csv" or ".bak." in f.name:
            continue
        if "_synthetic_master" in f.stem:
            member = f.stem.replace("_synthetic_master", "")
            members[member] = f

    if not members:
        print("No *_synthetic_master.csv files found.")
        return

    print(f"Found {len(members)} datasets: {list(members.keys())}\n" + "=" * 60)

    for member, master_path in members.items():
        public_path = args.input / f"{member}_round1_public.csv"
        prep_dataset(member, master_path, public_path)

    print(f"\n{'=' * 60}")
    print("Done. Now run the scorer:")
    print("  python dataset_scorer.py --input ./datasets --top 7")


if __name__ == "__main__":
    main()
