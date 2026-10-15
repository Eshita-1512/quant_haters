"""
patch_prediction_leak.py
========================
Fixes ALL mathematical data leaks in Round 1 (and Round 2) team files.

THE EXPLOITS FOUND:
  1. order_flow = ((close - low) / (high - low) * 2 - 1)
     -> close = ((order_flow + 1) / 2) * (high - low) + low  <- ONE LINE inversion!
  2. sma_10[t] = mean(close[t-9:t+1])
     -> close[t] = sma_10[t] * 10 - sum(close[t-9:t])
  3. momentum_5[t] = close[t] / close[t-5] - 1
     -> close[t] = (momentum_5[t] + 1) * close[t-5]
  4. rsi_14[t+1] > rsi_14[t]
     -> direction is near-perfect proxy for price direction.

THE FIX applied to all prediction rows (801-850):
  1. order_flow   -> recomputed as ((open - low) / (high - low) * 2 - 1)
                    open is already given in prediction rows -- no leak.
  2. sma_10       -> blanked (NaN). Directly invertible to close.
  3. sma_30       -> blanked (NaN). Directly invertible to close.
  4. momentum_5   -> blanked (NaN). Directly invertible to close.
  5. rsi_14       -> Gaussian noise (std=2.5) added to scramble adjacent-row direction
                    while preserving realistic feature scale for ML models.
  6. volatility_20 -> Option B: 20-day rolling standard deviation using historical returns
                    plus rolling open-to-open returns. Varies naturally each day (no flatline!)
                    with ZERO future close leak.

FEATURES UNCHANGED (safe for prediction rows):
  - open, high, low (given, not leaky)
  - volume, volume_z_20 (volume-based, unrelated to close)
  - target, close, return_1d (already blank)

Usage:
    python patch_prediction_leak.py
    python patch_prediction_leak.py --round2
    python patch_prediction_leak.py --dry-run
"""

import argparse
import numpy as np
import pandas as pd
from pathlib import Path

# -- Config -----------------------------------------------------------------
TEAM_FILES_DIR = Path("c:/Users/ESHITA/quant/team_files")
DATASETS_DIR   = Path("c:/Users/ESHITA/quant/datasets")

ROUND_CONFIG = {
    "round1": {"glob": "*/*_round1.csv", "train_rows": 800, "predict_rows": 50},
    "round2": {"glob": "*/*_round2.csv", "train_rows": 850, "predict_rows": 50},
}


def load_master_for_file(csv_path: Path) -> pd.DataFrame | None:
    """Find and load matching synthetic master CSV for a team CSV."""
    stock_dir = csv_path.parent.name
    candidates = list(DATASETS_DIR.glob(f"{stock_dir}*synthetic_master*.csv"))
    if not candidates:
        cleaned = stock_dir.lower().replace(" ", "").replace("%20", "_").replace("(1)", "")
        candidates = [
            c for c in DATASETS_DIR.glob("*synthetic_master*.csv")
            if cleaned in c.name.lower().replace(" ", "").replace("%20", "_")
        ]
    non_bak = [c for c in candidates if not c.name.endswith(".bak.csv")]
    chosen = non_bak[0] if non_bak else (candidates[0] if candidates else None)
    if chosen and chosen.exists():
        return pd.read_csv(chosen)
    return None


# -- Core patch function ----------------------------------------------------

def patch_file(path: Path, train_rows: int, predict_rows: int) -> bool:
    df = pd.read_csv(path)

    total_expected = train_rows + predict_rows
    if len(df) < total_expected:
        print(f"    WARNING: Only {len(df)} rows (expected {total_expected}). Skipping.")
        return False

    pred_start = train_rows
    pred_end = train_rows + predict_rows  # exclusive

    # 1. FIX order_flow in prediction rows
    # Old (leaky): order_flow = ((close - low) / (high - low)) * 2 - 1
    # New (safe):  order_flow = ((open  - low) / (high - low)) * 2 - 1
    if "order_flow" in df.columns:
        open_ = df["open"].iloc[pred_start:pred_end].astype(float).values
        high_ = df["high"].iloc[pred_start:pred_end].astype(float).values
        low_  = df["low"].iloc[pred_start:pred_end].astype(float).values
        denom = high_ - low_
        denom[denom == 0] = np.nan  # avoid divide-by-zero
        new_of = np.round((open_ - low_) / denom * 2 - 1, 4)
        df.iloc[pred_start:pred_end, df.columns.get_loc("order_flow")] = new_of

    # 2. BLANK directly-invertible close features
    # sma_10/30, momentum_5: can be algebraically solved for close in one line.
    for col in ["sma_10", "sma_30", "momentum_5"]:
        if col in df.columns:
            df.iloc[pred_start:pred_end, df.columns.get_loc(col)] = np.nan

    # 3. RSI_14: Restore from master if blanked, then add subtle noise (std=2.5)
    # Scrambles adjacent-row comparison trick while preserving signal for ML models.
    if "rsi_14" in df.columns:
        # Check if currently NaN (from earlier partial patch)
        if df["rsi_14"].iloc[pred_start:pred_end].isna().all():
            master_df = load_master_for_file(path)
            if master_df is not None and "date" in master_df.columns:
                team_start_date = df["date"].iloc[0]
                match_idx = master_df.index[master_df["date"] == team_start_date]
                if len(match_idx) > 0:
                    m_start = match_idx[0] + pred_start
                    m_end   = match_idx[0] + pred_end
                    if m_end <= len(master_df) and "rsi_14" in master_df.columns:
                        df.loc[pred_start:pred_end - 1, "rsi_14"] = master_df["rsi_14"].iloc[m_start:m_end].values

        rsi_vals = df["rsi_14"].iloc[pred_start:pred_end].astype(float).values
        # Reproducible seed per file
        rng = np.random.default_rng(seed=abs(hash(path.name)) % (2**32))
        noise = rng.normal(loc=0.0, scale=2.5, size=len(rsi_vals))
        rsi_noisy = np.clip(rsi_vals + noise, 0.0, 100.0).round(4)
        df.iloc[pred_start:pred_end, df.columns.get_loc("rsi_14")] = rsi_noisy

    # 4. OPTION B: RECOMPUTE volatility_20 using rolling returns
    # Uses known historical close returns + rolling open returns in prediction window.
    # No future close is used (zero leak), and values fluctuate naturally each day.
    if "volatility_20" in df.columns:
        rets = pd.to_numeric(df["return_1d"], errors="coerce").copy()
        open_s = pd.to_numeric(df["open"], errors="coerce")
        close_s = pd.to_numeric(df["close"], errors="coerce")

        for t in range(pred_start, pred_end):
            if t == pred_start:
                # Transition step: return from last known close to first prediction open
                prev_c = close_s.iloc[t - 1]
                curr_o = open_s.iloc[t]
                rets.iloc[t] = (curr_o - prev_c) / prev_c if (pd.notna(prev_c) and prev_c > 0) else 0.0
            else:
                # Subsequent steps: daily open-to-open return
                prev_o = open_s.iloc[t - 1]
                curr_o = open_s.iloc[t]
                rets.iloc[t] = (curr_o - prev_o) / prev_o if (pd.notna(prev_o) and prev_o > 0) else 0.0

            # 20-day rolling sample standard deviation up to day t
            window = rets.iloc[max(0, t - 19) : t + 1].dropna()
            val = round(float(window.std()), 6) if len(window) >= 2 else 0.0
            df.iloc[t, df.columns.get_loc("volatility_20")] = val

    # Ensure target, close, return_1d are strictly blank for prediction rows
    for blank_col in ["close", "return_1d", "target"]:
        if blank_col in df.columns:
            df.iloc[pred_start:pred_end, df.columns.get_loc(blank_col)] = np.nan

    df.to_csv(path, index=False)
    return True


# -- Main -------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Patch ALL data leaks in team prediction rows.")
    parser.add_argument("--round2",  action="store_true", help="Patch Round 2 files instead of Round 1")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing any files")
    args = parser.parse_args()

    round_key = "round2" if args.round2 else "round1"
    cfg = ROUND_CONFIG[round_key]

    print(f"\n{'='*62}")
    print(f"  Patching {round_key.upper()} -- sealing ALL close-price leaks")
    print(f"  - order_flow   : recomputed from open (non-leaky)")
    print(f"  - sma_10/30    : blanked (NaN)")
    print(f"  - momentum_5   : blanked (NaN)")
    print(f"  - rsi_14       : restored & jittered with std=2.5 noise")
    print(f"  - volatility_20: Option B rolling open returns (varies naturally)")
    print(f"{'='*62}\n")

    all_csvs = sorted(TEAM_FILES_DIR.glob(cfg["glob"]))
    all_csvs = [f for f in all_csvs if "master_validation" not in f.name]

    if not all_csvs:
        print(f"No {round_key} files found under {TEAM_FILES_DIR}")
        return

    print(f"Found {len(all_csvs)} file(s).\n")
    patched = skipped = 0

    for path in all_csvs:
        label = f"{path.parent.name}/{path.name}"
        if args.dry_run:
            print(f"  [DRY RUN] {label}")
            patched += 1
        else:
            ok = patch_file(path, cfg["train_rows"], cfg["predict_rows"])
            status = "Patched!" if ok else "Skipped."
            print(f"  {status:9s} {label}")
            if ok:
                patched += 1
            else:
                skipped += 1

    print(f"\n{'='*62}")
    verb = "Would patch" if args.dry_run else "Patched"
    print(f"  {verb}: {patched} | Skipped: {skipped}")
    print(f"{'='*62}\n")


if __name__ == "__main__":
    main()
