"""
Dataset Quality Scorer — Council Member Submission Evaluator
=============================================================
Purpose:
    Evaluates all dataset triplets submitted by council members and selects
    the top 6-7 best-quality datasets to use in the actual event.

Each council member submits up to 3 files (a "triplet"):
    - *_synthetic_master.csv   -> Full internal reference (organizers only)
    - *_round1_public.csv      -> What participants download
    - *_master_validation.csv  -> Secret answer key for scoring

Usage:
    Place all submitted files in a folder (default: ./datasets/)
    using the naming convention:
        <member_name>_synthetic_master.csv
        <member_name>_round1_public.csv
        <member_name>_master_validation.csv

    Then run:
        python dataset_scorer.py [--input ./datasets] [--top 7] [--output ./selected]

Scoring Dimensions (100 pts total):
    1. Schema Validity          (15 pts) -- correct columns, no missing values
    2. GBM Fidelity             (20 pts) -- pre/post crash volatility ratio
    3. Flash Crash Architecture (20 pts) -- crash magnitude, timing, regime flag
    4. Class Balance            (15 pts) -- target distribution not too skewed
    5. Feature Quality          (15 pts) -- RSI range, SMA validity, OHLC consistency
    6. Cross-file Consistency   (15 pts) -- master <-> public <-> validation alignment
"""

import argparse
import os
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# ─────────────────────────────────────────────────────────────
# CONSTANTS (from spec.md / generate_synthetic_data.py)
# ─────────────────────────────────────────────────────────────

REQUIRED_MASTER_COLS = {
    "timestamp", "date", "asset_id",
    "open", "high", "low", "close", "volume",
    "return_1d", "sma_10", "sma_30", "momentum_5",
    "volatility_20", "rsi_14", "volume_z_20", "order_flow",
    "regime", "next_return", "target",
    # NOTE: flash_crash_day is optional — crash is auto-detected from regime transition
}

REQUIRED_PUBLIC_COLS = {
    "timestamp", "date", "asset_id",
    "open", "high", "low", "close", "volume",
    "return_1d", "sma_10", "sma_30", "momentum_5",
    "volatility_20", "rsi_14", "volume_z_20", "order_flow",
}

REQUIRED_VALIDATION_COLS = {
    "timestamp", "date", "asset_id", "next_return", "target"
}

SECRET_COLS_IN_PUBLIC = {"regime", "flash_crash_day", "next_return", "target"}

MIN_MASTER_ROWS    = 1900   # Should be ~1973 rows after dropping NaN warmup
MIN_PUBLIC_ROWS    = 1900
VALIDATION_ROWS    = 50     # Must be exactly 50 prediction rows

EXPECTED_VOLATILITY_RATIO_MIN = 1.5
EXPECTED_VOLATILITY_RATIO_MAX = 5.0

TARGET_BALANCE_MIN = 0.35
TARGET_BALANCE_MAX = 0.65

CRASH_RETURN_MIN   = -0.20
CRASH_RETURN_MAX   = -0.05

RSI_VALID_MIN      = 0.0
RSI_VALID_MAX      = 100.0

# ─────────────────────────────────────────────────────────────
# DATA STRUCTURES
# ─────────────────────────────────────────────────────────────

@dataclass
class ScoreBreakdown:
    schema:          float = 0.0   # /15
    gbm_fidelity:    float = 0.0   # /20
    flash_crash:     float = 0.0   # /20
    class_balance:   float = 0.0   # /15
    feature_quality: float = 0.0   # /15
    cross_file:      float = 0.0   # /15
    issues:   list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    @property
    def total(self) -> float:
        return (
            self.schema + self.gbm_fidelity + self.flash_crash +
            self.class_balance + self.feature_quality + self.cross_file
        )


@dataclass
class DatasetResult:
    member_name:     str
    master_path:     Optional[Path] = None
    public_path:     Optional[Path] = None
    validation_path: Optional[Path] = None
    score:           Optional[ScoreBreakdown] = None
    load_error:      Optional[str] = None


# ─────────────────────────────────────────────────────────────
# FILE DISCOVERY
# ─────────────────────────────────────────────────────────────

def discover_triplets(input_dir: Path) -> list:
    """
    Scan input_dir for files matching the naming convention:
        <member_name>_synthetic_master.csv
        <member_name>_round1_public.csv
        <member_name>_master_validation.csv
    """
    results: dict = {}

    for f in sorted(input_dir.iterdir()):
        if f.suffix.lower() != ".csv":
            continue
        if ".bak." in f.name or f.stem.endswith(".bak"):
            continue  # skip backups created by dataset_prep.py
        name = f.stem

        if "_synthetic_master" in name:
            member = name.replace("_synthetic_master", "")
            results.setdefault(member, DatasetResult(member_name=member))
            results[member].master_path = f

        elif "_round1_public" in name:
            member = name.replace("_round1_public", "")
            results.setdefault(member, DatasetResult(member_name=member))
            results[member].public_path = f

        elif "_master_validation" in name:
            member = name.replace("_master_validation", "")
            results.setdefault(member, DatasetResult(member_name=member))
            results[member].validation_path = f

        # Handle plain "master_validation.csv" (no member prefix)
        elif name == "master_validation":
            member = "default"
            results.setdefault(member, DatasetResult(member_name=member))
            results[member].validation_path = f

    return list(results.values())


# ─────────────────────────────────────────────────────────────
# SCORING FUNCTIONS
# ─────────────────────────────────────────────────────────────

def score_schema(master, public, validation, breakdown: ScoreBreakdown) -> None:
    """Score 1: Schema Validity (15 pts)"""
    pts = 15.0

    if master is None:
        breakdown.issues.append("MISSING: synthetic_master file not found (-8 pts)")
        pts -= 8
    else:
        missing = REQUIRED_MASTER_COLS - set(master.columns)
        if missing:
            breakdown.issues.append(f"Master missing columns: {sorted(missing)} (-5 pts)")
            pts -= 5
        if master.isnull().any().any():
            null_cols = master.columns[master.isnull().any()].tolist()
            breakdown.warnings.append(f"Master has NaN values in: {null_cols}")
            pts -= 2
        if SECRET_COLS_IN_PUBLIC & set(master.columns) != SECRET_COLS_IN_PUBLIC:
            breakdown.warnings.append("Master missing some internal secret columns")
            pts -= 1

    if public is None:
        breakdown.issues.append("MISSING: round1_public file not found (-4 pts)")
        pts -= 4
    else:
        missing = REQUIRED_PUBLIC_COLS - set(public.columns)
        if missing:
            breakdown.issues.append(f"Public missing columns: {sorted(missing)} (-3 pts)")
            pts -= 3
        leaked = SECRET_COLS_IN_PUBLIC & set(public.columns)
        if leaked:
            breakdown.issues.append(f"PUBLIC FILE LEAKS SECRET COLUMNS: {leaked} (-4 pts)")
            pts -= 4
        if public.isnull().any().any():
            breakdown.warnings.append("Public file has NaN values")
            pts -= 1

    if validation is None:
        breakdown.issues.append("MISSING: master_validation file not found (-3 pts)")
        pts -= 3
    else:
        missing = REQUIRED_VALIDATION_COLS - set(validation.columns)
        if missing:
            breakdown.issues.append(f"Validation missing columns: {sorted(missing)} (-2 pts)")
            pts -= 2
        n = len(validation)
        if n != VALIDATION_ROWS:
            breakdown.issues.append(
                f"Validation must have exactly {VALIDATION_ROWS} rows, got {n} (-2 pts)"
            )
            pts -= 2

    breakdown.schema = max(0.0, pts)


def score_gbm_fidelity(master, breakdown: ScoreBreakdown) -> None:
    """Score 2: GBM Fidelity (20 pts)"""
    if master is None:
        breakdown.gbm_fidelity = 0.0
        return

    pts = 20.0

    if "regime" not in master.columns or "return_1d" not in master.columns:
        breakdown.issues.append("Cannot compute GBM fidelity: missing regime/return_1d")
        breakdown.gbm_fidelity = 0.0
        return

    pre_returns  = master.loc[master["regime"] == 0, "return_1d"].dropna()
    post_returns = master.loc[master["regime"] == 1, "return_1d"].dropna()

    if len(pre_returns) < 50:
        breakdown.issues.append("Too few pre-crash rows to assess GBM fidelity (-10 pts)")
        pts -= 10
    if len(post_returns) < 50:
        breakdown.issues.append("Too few post-crash rows to assess GBM fidelity (-10 pts)")
        pts -= 10
        breakdown.gbm_fidelity = max(0.0, pts)
        return

    pre_vol  = pre_returns.std() * np.sqrt(252)
    post_vol = post_returns.std() * np.sqrt(252)

    if pre_vol == 0:
        breakdown.issues.append("Pre-crash volatility is zero — constant prices detected (-15 pts)")
        pts -= 15
        breakdown.gbm_fidelity = max(0.0, pts)
        return

    ratio = post_vol / pre_vol
    if not (EXPECTED_VOLATILITY_RATIO_MIN <= ratio <= EXPECTED_VOLATILITY_RATIO_MAX):
        breakdown.issues.append(
            f"Volatility ratio {ratio:.2f}x outside expected range "
            f"[{EXPECTED_VOLATILITY_RATIO_MIN}x, {EXPECTED_VOLATILITY_RATIO_MAX}x] (-10 pts)"
        )
        pts -= 10
    else:
        breakdown.warnings.append(
            f"  v Volatility ratio: {ratio:.2f}x (pre={pre_vol:.1%}, post={post_vol:.1%})"
        )

    if "close" in master.columns and (master["close"] <= 0).any():
        breakdown.issues.append("Negative/zero close prices detected (-5 pts)")
        pts -= 5

    if len(master) < MIN_MASTER_ROWS:
        breakdown.issues.append(
            f"Master only has {len(master)} rows (expected >= {MIN_MASTER_ROWS}) (-5 pts)"
        )
        pts -= 5

    breakdown.gbm_fidelity = max(0.0, pts)


def _detect_crash_row(master: pd.DataFrame):
    """
    Find the flash crash day. Prefers an explicit flash_crash_day==1 column.
    Falls back to the first day where regime changes from 0 to 1 (the transition
    boundary). Returns the single crash row as a Series, or None.
    """
    # Method 1: explicit column
    if "flash_crash_day" in master.columns:
        rows = master[master["flash_crash_day"] == 1]
        if len(rows) > 0:
            return rows.iloc[0], "explicit"

    # Method 2: detect regime 0->1 transition — return the FIRST day of regime=1 (the crash day)
    if "regime" in master.columns and "timestamp" in master.columns:
        df = master.sort_values("timestamp")
        first_crash_rows = df[df["regime"] == 1]
        if len(first_crash_rows) > 0:
            return first_crash_rows.iloc[0], "regime_transition"


    # Method 3: largest negative return day
    if "return_1d" in master.columns:
        idx = master["return_1d"].idxmin()
        return master.loc[idx], "min_return"

    return None, None


def score_flash_crash(master, breakdown: ScoreBreakdown) -> None:
    """Score 3: Flash Crash Architecture (20 pts)"""
    if master is None:
        breakdown.flash_crash = 0.0
        return

    pts = 20.0

    # Detect crash day (works with or without explicit flash_crash_day column)
    crash_row, detection_method = _detect_crash_row(master)

    if crash_row is None:
        breakdown.issues.append("Cannot detect flash crash day — no regime or return_1d column (-15 pts)")
        pts -= 15
        breakdown.flash_crash = max(0.0, pts)
        return

    if detection_method != "explicit":
        breakdown.warnings.append(
            f"  [auto-detected crash via {detection_method} — no flash_crash_day column]"
        )

    # Check crash return magnitude
    if "return_1d" in master.columns:
        crash_return = crash_row["return_1d"]
        if not (CRASH_RETURN_MIN <= crash_return <= CRASH_RETURN_MAX):
            breakdown.issues.append(
                f"Crash return {crash_return:.2%} outside expected range "
                f"[{CRASH_RETURN_MIN:.0%}, {CRASH_RETURN_MAX:.0%}] (-8 pts)"
            )
            pts -= 8
        else:
            breakdown.warnings.append(f"  v Crash magnitude: {crash_return:.2%}")

    # Check regime flags are correct around crash point
    if "regime" in master.columns and "timestamp" in master.columns:
        crash_ts   = crash_row["timestamp"]
        pre_regime  = master.loc[master["timestamp"] < crash_ts, "regime"].unique()
        post_regime = master.loc[master["timestamp"] > crash_ts, "regime"].unique()
        if 0 not in pre_regime:
            breakdown.issues.append("Pre-crash regime is not 0 (-5 pts)")
            pts -= 5
        if 1 not in post_regime:
            breakdown.issues.append("Post-crash regime is not 1 (-5 pts)")
            pts -= 5
        else:
            breakdown.warnings.append("  v Regime flags: 0 (normal) -> 1 (crash) transition confirmed")

    # Check crash timing — should not be too early or too late
    if "timestamp" in master.columns:
        crash_ts = crash_row["timestamp"]
        total_ts = master["timestamp"].max()
        pct = crash_ts / total_ts
        if pct < 0.30 or pct > 0.80:
            breakdown.issues.append(
                f"Crash timing {pct:.0%} into timeline is outside ideal range [30%-80%] (-3 pts)"
            )
            pts -= 3
        else:
            breakdown.warnings.append(f"  v Crash timing: day {int(crash_ts)}/{int(total_ts)} ({pct:.0%})")

    breakdown.flash_crash = max(0.0, pts)


def score_class_balance(master, validation, breakdown: ScoreBreakdown) -> None:
    """Score 4: Class Balance (15 pts)"""
    pts = 15.0

    if master is not None and "target" in master.columns:
        tgt = master["target"].dropna()
        if len(tgt) > 0:
            balance = tgt.mean()
            if not (TARGET_BALANCE_MIN <= balance <= TARGET_BALANCE_MAX):
                breakdown.issues.append(
                    f"Master target imbalanced: {balance:.1%} UP (ideal: 40-60%) (-8 pts)"
                )
                pts -= 8
            else:
                breakdown.warnings.append(f"  v Master class balance: {balance:.1%} UP")
    else:
        breakdown.warnings.append("Cannot check master class balance")
        pts -= 3

    if validation is not None and "target" in validation.columns:
        tgt = validation["target"].dropna()
        if len(tgt) > 0:
            balance = tgt.mean()
            if not (TARGET_BALANCE_MIN <= balance <= TARGET_BALANCE_MAX):
                breakdown.issues.append(
                    f"Validation target imbalanced: {balance:.1%} UP (-5 pts)"
                )
                pts -= 5
            else:
                breakdown.warnings.append(f"  v Validation class balance: {balance:.1%} UP")
    else:
        pts -= 2

    breakdown.class_balance = max(0.0, pts)


def score_feature_quality(master, breakdown: ScoreBreakdown) -> None:
    """Score 5: Feature Quality (15 pts)"""
    if master is None:
        breakdown.feature_quality = 0.0
        return

    pts = 15.0

    if "rsi_14" in master.columns:
        rsi = master["rsi_14"].dropna()
        if (rsi < RSI_VALID_MIN).any() or (rsi > RSI_VALID_MAX).any():
            breakdown.issues.append(
                f"RSI values outside [0, 100]: min={rsi.min():.1f}, max={rsi.max():.1f} (-5 pts)"
            )
            pts -= 5
        else:
            breakdown.warnings.append(f"  v RSI range valid: [{rsi.min():.1f}, {rsi.max():.1f}]")
    else:
        breakdown.warnings.append("Missing rsi_14 column")
        pts -= 3

    if "sma_10" in master.columns and "close" in master.columns:
        ratio = (master["sma_10"] / master["close"]).dropna()
        if (ratio > 2.0).any() or (ratio < 0.3).any():
            breakdown.issues.append("SMA_10 diverges wildly from close price (-4 pts)")
            pts -= 4
        else:
            breakdown.warnings.append("  v SMA_10 tracks close price reasonably")

    if all(c in master.columns for c in ["open", "high", "low", "close"]):
        v_high = (master["high"] < master[["open", "close"]].max(axis=1)).sum()
        v_low  = (master["low"]  > master[["open", "close"]].min(axis=1)).sum()
        total  = v_high + v_low
        if total > 0:
            pct = total / len(master)
            breakdown.issues.append(
                f"OHLC consistency violations: {total} rows ({pct:.1%}) (-4 pts)"
            )
            pts -= min(4, 4 * pct * 10)
        else:
            breakdown.warnings.append("  v OHLC consistency: all rows valid")

    if "volume" in master.columns and (master["volume"] <= 0).any():
        breakdown.issues.append("Non-positive volume values found (-2 pts)")
        pts -= 2

    breakdown.feature_quality = max(0.0, pts)


def score_cross_file_consistency(master, public, validation, breakdown: ScoreBreakdown) -> None:
    """Score 6: Cross-file Consistency (15 pts)"""
    pts = 15.0

    if master is not None and public is not None:
        if "timestamp" in master.columns and "timestamp" in public.columns:
            pub_ts  = set(public["timestamp"].tolist())
            mast_ts = set(master["timestamp"].tolist())
            extra   = pub_ts - mast_ts
            if extra:
                breakdown.issues.append(
                    f"Public has {len(extra)} timestamps not in master (-5 pts)"
                )
                pts -= 5
            else:
                breakdown.warnings.append("  v Public timestamps are subset of master")

        shared_cols = list(
            (set(master.columns) & set(public.columns)) -
            {"date", "asset_id", "timestamp"}
        )
        if shared_cols:
            m_sub = master.set_index("timestamp")[shared_cols]
            p_sub = public.set_index("timestamp")[shared_cols]
            common_idx = m_sub.index.intersection(p_sub.index)
            if len(common_idx) > 0:
                mismatches = (
                    m_sub.loc[common_idx].round(4) != p_sub.loc[common_idx].round(4)
                ).sum().sum()
                if mismatches > 0:
                    breakdown.issues.append(
                        f"Master/public value mismatch: {mismatches} cells differ (-5 pts)"
                    )
                    pts -= 5
                else:
                    breakdown.warnings.append("  v Master <-> public values are identical")

    if master is not None and validation is not None:
        if "timestamp" in master.columns and "timestamp" in validation.columns:
            val_ts  = set(validation["timestamp"].tolist())
            mast_ts = set(master["timestamp"].tolist())
            extra   = val_ts - mast_ts
            if extra:
                breakdown.issues.append(
                    f"Validation has {len(extra)} timestamps not in master (-3 pts)"
                )
                pts -= 3
            else:
                breakdown.warnings.append("  v Validation timestamps exist in master")

        if "target" in master.columns and "target" in validation.columns:
            m_tgt = master.set_index("timestamp")["target"]
            v_tgt = validation.set_index("timestamp")["target"]
            common = m_tgt.index.intersection(v_tgt.index)
            if len(common) > 0:
                mismatches = (m_tgt.loc[common] != v_tgt.loc[common]).sum()
                if mismatches > 0:
                    breakdown.issues.append(
                        f"Target mismatch between master and validation: {mismatches} rows (-5 pts)"
                    )
                    pts -= 5
                else:
                    breakdown.warnings.append("  v Master <-> validation targets match")

    asset_ids = set()
    for df in [master, public, validation]:
        if df is not None and "asset_id" in df.columns:
            asset_ids.update(df["asset_id"].unique().tolist())
    if len(asset_ids) > 1:
        breakdown.issues.append(f"Inconsistent asset_id across files: {asset_ids} (-2 pts)")
        pts -= 2

    breakdown.cross_file = max(0.0, pts)


# ─────────────────────────────────────────────────────────────
# MAIN SCORER
# ─────────────────────────────────────────────────────────────

def load_csv_safe(path):
    if path is None:
        return None, None
    try:
        return pd.read_csv(path), None
    except Exception as e:
        return None, str(e)


def score_dataset(result: DatasetResult) -> DatasetResult:
    breakdown = ScoreBreakdown()

    master, err = load_csv_safe(result.master_path)
    if err:
        breakdown.issues.append(f"Failed to load master: {err}")
        master = None

    public, err = load_csv_safe(result.public_path)
    if err:
        breakdown.issues.append(f"Failed to load public: {err}")
        public = None

    validation, err = load_csv_safe(result.validation_path)
    if err:
        breakdown.issues.append(f"Failed to load validation: {err}")
        validation = None

    score_schema(master, public, validation, breakdown)
    score_gbm_fidelity(master, breakdown)
    score_flash_crash(master, breakdown)
    score_class_balance(master, validation, breakdown)
    score_feature_quality(master, breakdown)
    score_cross_file_consistency(master, public, validation, breakdown)

    result.score = breakdown
    return result


# ─────────────────────────────────────────────────────────────
# REPORTING
# ─────────────────────────────────────────────────────────────

WIDTH = 72

def bar(value: float, max_value: float, width: int = 20) -> str:
    filled = int(round(value / max_value * width))
    return "=" * filled + "-" * (width - filled)


def print_report(results: list, top_n: int) -> list:
    scored = [r for r in results if r.score is not None]
    scored.sort(key=lambda r: r.score.total, reverse=True)

    print("\n" + "=" * WIDTH)
    print("  DATASET QUALITY SCORING REPORT")
    print("=" * WIDTH)
    print(f"  {'Rank':<6} {'Member':<22} {'Total':>6}  {'Schema':>6} {'GBM':>6} {'Crash':>6} {'Bal':>5} {'Feat':>5} {'Xfile':>6}")
    print(f"  {'':6} {'':22} {'/100':>6}  {'/15':>6} {'/20':>6} {'/20':>6} {'/15':>5} {'/15':>5} {'/15':>6}")
    print("  " + "-" * (WIDTH - 2))

    medals = ["1st", "2nd", "3rd"]
    for i, r in enumerate(scored):
        s = r.score
        rank_label = medals[i] if i < 3 else f"#{i+1}"
        tag = " [SELECTED]" if i < top_n else " [REJECTED]"
        print(
            f"  {rank_label:<6} {r.member_name:<22} {s.total:>6.1f}{tag}"
            f"  {s.schema:>6.1f} {s.gbm_fidelity:>6.1f} {s.flash_crash:>6.1f}"
            f" {s.class_balance:>5.1f} {s.feature_quality:>5.1f} {s.cross_file:>6.1f}"
        )

    print("\n" + "=" * WIDTH)
    print("  DETAILED BREAKDOWN")
    print("=" * WIDTH)

    for i, r in enumerate(scored):
        s = r.score
        tag = "[SELECTED]" if i < top_n else "[REJECTED]"
        print(f"\n  {tag} #{i+1}. {r.member_name}  -->  {s.total:.1f}/100")
        print(f"    Files:")
        print(f"      Master     : {r.master_path or 'MISSING'}")
        print(f"      Public     : {r.public_path or 'MISSING'}")
        print(f"      Validation : {r.validation_path or 'MISSING'}")
        print(f"    Score bars:")
        print(f"      Schema       [{bar(s.schema,          15)}] {s.schema:5.1f}/15")
        print(f"      GBM Fidelity [{bar(s.gbm_fidelity,    20)}] {s.gbm_fidelity:5.1f}/20")
        print(f"      Flash Crash  [{bar(s.flash_crash,     20)}] {s.flash_crash:5.1f}/20")
        print(f"      Class Bal.   [{bar(s.class_balance,   15)}] {s.class_balance:5.1f}/15")
        print(f"      Features     [{bar(s.feature_quality, 15)}] {s.feature_quality:5.1f}/15")
        print(f"      Cross-file   [{bar(s.cross_file,      15)}] {s.cross_file:5.1f}/15")
        if s.issues:
            print(f"    Issues ({len(s.issues)}):")
            for issue in s.issues:
                print(f"       - {issue}")
        passing = [w for w in s.warnings if w.strip().startswith("v ")]
        if passing:
            print(f"    Passed checks:")
            for w in passing:
                print(f"       + {w.strip()}")

    return scored[:top_n]


# ─────────────────────────────────────────────────────────────
# FILE COPYING
# ─────────────────────────────────────────────────────────────

def copy_selected(selected: list, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n{'=' * WIDTH}")
    print(f"  COPYING TOP {len(selected)} DATASETS  -->  {output_dir}/")
    print(f"{'=' * WIDTH}")

    for rank, r in enumerate(selected, 1):
        member_out = output_dir / r.member_name
        member_out.mkdir(exist_ok=True)

        for src, label in [
            (r.master_path,     "synthetic_master"),
            (r.public_path,     "round1_public"),
            (r.validation_path, "master_validation"),
        ]:
            if src is not None and src.exists():
                dst = member_out / f"{r.member_name}_{label}.csv"
                shutil.copy2(src, dst)
                print(f"  #{rank} {r.member_name:<20} --> {dst.name}")

    summary_path = output_dir / "selection_summary.csv"
    rows = []
    for rank, r in enumerate(selected, 1):
        s = r.score
        rows.append({
            "rank":            rank,
            "member":          r.member_name,
            "total":           round(s.total, 2),
            "schema":          round(s.schema, 2),
            "gbm_fidelity":    round(s.gbm_fidelity, 2),
            "flash_crash":     round(s.flash_crash, 2),
            "class_balance":   round(s.class_balance, 2),
            "feature_quality": round(s.feature_quality, 2),
            "cross_file":      round(s.cross_file, 2),
            "issues":          "; ".join(r.score.issues) or "none",
        })
    pd.DataFrame(rows).to_csv(summary_path, index=False)
    print(f"\n  Summary CSV saved --> {summary_path}")


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Score and select the best council member datasets for the quant event."
    )
    parser.add_argument(
        "--input", "-i",
        type=Path,
        default=Path("./datasets"),
        help="Directory containing submitted dataset files (default: ./datasets)"
    )
    parser.add_argument(
        "--top", "-n",
        type=int,
        default=7,
        help="Number of top datasets to select (default: 7)"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=Path("./selected"),
        help="Output directory for selected datasets (default: ./selected)"
    )
    parser.add_argument(
        "--no-copy",
        action="store_true",
        help="Print report only, do not copy files to output dir"
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: Input directory '{args.input}' does not exist.")
        print(f"   Create it and place dataset files inside using naming convention:")
        print(f"   <member_name>_synthetic_master.csv")
        print(f"   <member_name>_round1_public.csv")
        print(f"   <member_name>_master_validation.csv")
        sys.exit(1)

    print(f"\nScanning '{args.input}' for dataset triplets...")
    triplets = discover_triplets(args.input)

    if not triplets:
        print(f"ERROR: No dataset files found in '{args.input}'.")
        sys.exit(1)

    print(f"   Found {len(triplets)} dataset(s): {[t.member_name for t in triplets]}")
    print(f"   Scoring each one...\n")

    results  = [score_dataset(r) for r in triplets]
    selected = print_report(results, args.top)

    if not args.no_copy:
        copy_selected(selected, args.output)

    print(f"\nDone. Selected {len(selected)}/{len(results)} datasets.\n")


if __name__ == "__main__":
    main()
