"""
generate_round1_data.py

Regenerates every team's Round 1 dataset with no prediction-window leaks and a
small, honest, learnable signal.

How the data works
  Tomorrow's return depends a little on two things that are visible today:
    order_flow (stronger when volume_z_20 is high), plus random noise.
  The best possible model is right about 60 to 63 percent of the time,
  so no AI can score near 100 and careful modelling still beats guessing.

What teams get
  Rows 1-800   : full OHLCV, every feature, and target.
  Rows 801-850 : only timestamp, date, asset_id, volume, volume_z_20, order_flow.
                 These are generated independently of the price path, so they
                 carry no information about hidden closes. All price columns
                 and target are blank.

Outputs (inside --out-dir)
  team_files/<STOCK>/<STOCK>_<TEAM>_round1.csv   files teams download
  truth/<STOCK>_<TEAM>_truth.csv                 full hidden path, rows 1-851,
                                                 for building the Round 2 file
  master_validation.csv                          scoring key; rows 801-850 replaced,
                                                 any existing 851-900 rows kept
  leak_report.txt                                leak check results

Usage
  python generate_round1_data.py --teams-from master_validation.csv --out-dir round1_output
  python generate_round1_data.py --teams-from master_validation.csv --out-dir round1_output --seed 7

Requires numpy and pandas only. The script exits with code 1 if the leak check fails.
"""

import argparse
import sys
import zlib
from pathlib import Path

import numpy as np
import pandas as pd

TRAIN_ROWS = 800
PRED_ROWS = 50
TOTAL_ROWS = TRAIN_ROWS + PRED_ROWS + 1
PRED_START = TRAIN_ROWS + 1
PRED_END = TRAIN_ROWS + PRED_ROWS

DAILY_SIGMA_RANGE = (0.011, 0.022)
DRIFT_ANNUAL_RANGE = (-0.02, 0.10)
FLOW_AR = 0.25
SIGNAL_TO_NOISE = 0.65
VOLUME_BOOST = 0.6
LEAK_LIMIT = 0.66

PUBLIC_COLUMNS = [
    "timestamp", "date", "asset_id", "open", "high", "low", "close", "volume",
    "return_1d", "sma_10", "sma_30", "momentum_5", "volatility_20", "rsi_14",
    "volume_z_20", "order_flow", "target",
]
PRED_VISIBLE = ["timestamp", "date", "asset_id", "volume", "volume_z_20", "order_flow"]


def stable_seed(*parts) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode()) & 0x7FFFFFFF


def wilder_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    return rsi.fillna(100.0).where(avg_gain.notna())


def stock_profile(stock: str, base_seed: int) -> dict:
    rng = np.random.default_rng(stable_seed(base_seed, "stock", stock))
    return {
        "start_price": float(rng.uniform(40, 400)),
        "sigma": float(rng.uniform(*DAILY_SIGMA_RANGE)),
        "drift": float(rng.uniform(*DRIFT_ANNUAL_RANGE)) / 252,
        "base_volume": float(rng.uniform(5e5, 5e6)),
    }


def build_path(team: str, stock: str, base_seed: int) -> pd.DataFrame:
    prof = stock_profile(stock, base_seed)
    rng = np.random.default_rng(stable_seed(base_seed, "team", team, stock))
    n = TOTAL_ROWS
    sigma = prof["sigma"]

    flow_raw = np.zeros(n)
    shocks = rng.standard_normal(n)
    flow_raw[0] = shocks[0]
    for t in range(1, n):
        flow_raw[t] = FLOW_AR * flow_raw[t - 1] + np.sqrt(1 - FLOW_AR**2) * shocks[t]
    order_flow = np.tanh(flow_raw / 1.5)

    volume = (prof["base_volume"] * rng.lognormal(0.0, 0.35, n)).astype(np.int64)
    vol_series = pd.Series(volume, dtype=float)
    volume_z = (vol_series - vol_series.rolling(20).mean()) / vol_series.rolling(20).std()
    vz_filled = volume_z.fillna(0.0).to_numpy()

    strength = 1 + VOLUME_BOOST * np.tanh(vz_filled)
    signal = SIGNAL_TO_NOISE * sigma * order_flow * strength
    noise = sigma * rng.standard_normal(n)

    returns = np.zeros(n)
    for t in range(1, n):
        returns[t] = prof["drift"] + signal[t - 1] + noise[t]
    returns = np.clip(returns, -0.25, 0.25)

    close = prof["start_price"] * np.cumprod(1 + returns)
    prev_close = np.concatenate([[close[0] / (1 + returns[0])], close[:-1]])
    open_ = prev_close * (1 + rng.normal(0, 0.15 * sigma, n))
    body_hi = np.maximum(open_, close)
    body_lo = np.minimum(open_, close)
    high = body_hi * (1 + np.abs(rng.normal(0, 0.5 * sigma, n)))
    low = body_lo * (1 - np.abs(rng.normal(0, 0.5 * sigma, n)))

    start_day = pd.Timestamp("2016-01-04") + pd.offsets.BDay(int(rng.integers(0, 700)))
    dates = pd.bdate_range(start=start_day, periods=n)

    df = pd.DataFrame({
        "timestamp": np.arange(1, n + 1),
        "date": dates.strftime("%Y-%m-%d"),
        "asset_id": stock,
        "open": open_.round(4),
        "high": high.round(4),
        "low": low.round(4),
        "close": close.round(4),
        "volume": volume,
    })
    c = df["close"]
    df["return_1d"] = c.pct_change().round(6)
    df["sma_10"] = c.rolling(10).mean().round(4)
    df["sma_30"] = c.rolling(30).mean().round(4)
    df["momentum_5"] = c.pct_change(5).round(6)
    df["volatility_20"] = df["return_1d"].rolling(20).std().round(6)
    df["rsi_14"] = wilder_rsi(c).round(4)
    df["volume_z_20"] = volume_z.round(4)
    df["order_flow"] = order_flow.round(4)
    next_ret = c.shift(-1) / c - 1
    df["next_return"] = next_ret.round(6)
    df["target"] = (next_ret > 0).astype(float).where(next_ret.notna())
    df["oracle_up"] = (prof["drift"] + signal > 0).astype(int)
    return df


def team_file(df: pd.DataFrame) -> pd.DataFrame:
    out = df[PUBLIC_COLUMNS].iloc[: PRED_END].copy()
    pred = out["timestamp"] >= PRED_START
    hidden = [col for col in PUBLIC_COLUMNS if col not in PRED_VISIBLE]
    out[hidden] = out[hidden].astype(object)
    out.loc[pred, hidden] = np.nan
    out["target"] = out["target"].astype("Int64").astype(object).where(~pred, np.nan)
    return out


def validation_rows(team: str, stock: str, df: pd.DataFrame) -> pd.DataFrame:
    win = df[(df["timestamp"] >= PRED_START) & (df["timestamp"] <= PRED_END)]
    return pd.DataFrame({
        "team_id": team,
        "stock_id": stock,
        "master_timestamp": win["timestamp"].astype(int),
        "target_r1r2": win["target"].astype(int),
        "target_r3": win["next_return"].round(6),
    })


def leak_check(files: dict, truth: dict) -> tuple[bool, list[str]]:
    lines = []
    pooled = {}
    oracle_hits = oracle_n = 0
    for key, tf in files.items():
        y = truth[key].set_index("timestamp")["target"]
        pred = tf[tf["timestamp"] >= PRED_START].set_index("timestamp")
        ts = list(range(PRED_START, PRED_END + 1))
        target = np.array([y[t] for t in ts], dtype=float)
        oracle = truth[key].set_index("timestamp")["oracle_up"]
        oracle_hits += int(sum(oracle[t] == y[t] for t in ts))
        oracle_n += len(ts)
        for col in pred.columns:
            vals = pd.to_numeric(pred[col], errors="coerce").reindex(ts).to_numpy(dtype=float)
            if np.all(np.isnan(vals)):
                continue
            med = np.nanmedian(vals)
            rules = {
                f"{col} > median": vals > med,
                f"{col}[t+1] > {col}[t]": np.append(vals[1:] > vals[:-1], False),
                f"{col}[t+1] > median": np.append(vals[1:] > med, False),
                f"{col}[t+2] > {col}[t+1]": np.append(vals[2:] > vals[1:-1], [False, False]),
            }
            for name, guess in rules.items():
                usable = slice(0, len(ts) - 2)
                hits = int(np.sum(guess[usable] == (target[usable] == 1)))
                total = len(target[usable])
                prev = pooled.get(name, (0, 0))
                pooled[name] = (prev[0] + hits, prev[1] + total)
    worst_name, worst_acc = "", 0.0
    for name, (hits, total) in sorted(pooled.items()):
        acc = hits / total
        best = max(acc, 1 - acc)
        lines.append(f"{name:40s} {best:.3f}")
        if best > worst_acc:
            worst_name, worst_acc = name, best
    oracle_acc = oracle_hits / oracle_n
    lines.insert(0, f"Best possible honest accuracy (true signal, pooled): {oracle_acc:.3f}")
    lines.insert(1, f"Strongest single-column rule: {worst_name} -> {worst_acc:.3f} (limit {LEAK_LIMIT})")
    lines.insert(2, "")
    ok = worst_acc <= LEAK_LIMIT and oracle_acc <= LEAK_LIMIT
    return ok, lines


def read_team_list(path: Path) -> list[tuple[str, str]]:
    master = pd.read_csv(path, usecols=["team_id", "stock_id"])
    pairs = master.drop_duplicates().sort_values(["stock_id", "team_id"])
    return [(str(t), str(s)) for t, s in pairs.itertuples(index=False)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate leak-free Round 1 team datasets.")
    parser.add_argument("--teams-from", required=True, type=Path,
                        help="Existing master_validation.csv; team_id and stock_id pairs are read from it.")
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()

    if not args.teams_from.is_file():
        print(f"ERROR: {args.teams_from} not found.")
        return 1
    pairs = read_team_list(args.teams_from)
    if not pairs:
        print("ERROR: no team_id/stock_id pairs found.")
        return 1

    out = args.out_dir
    (out / "team_files").mkdir(parents=True, exist_ok=True)
    (out / "truth").mkdir(parents=True, exist_ok=True)

    files, truths, validations = {}, {}, []
    for team, stock in pairs:
        df = build_path(team, stock, args.seed)
        tf = team_file(df)
        stock_dir = out / "team_files" / stock
        stock_dir.mkdir(parents=True, exist_ok=True)
        tf.to_csv(stock_dir / f"{stock}_{team}_round1.csv", index=False)
        df.drop(columns=["oracle_up"]).to_csv(out / "truth" / f"{stock}_{team}_truth.csv", index=False)
        files[(team, stock)] = tf
        truths[(team, stock)] = df
        validations.append(validation_rows(team, stock, df))

    new_val = pd.concat(validations, ignore_index=True)
    old = pd.read_csv(args.teams_from)
    keep = old[(old["master_timestamp"] < PRED_START) | (old["master_timestamp"] > PRED_END)]
    keep = keep[["team_id", "stock_id", "master_timestamp", "target_r1r2", "target_r3"]]
    merged = pd.concat([new_val, keep], ignore_index=True)
    merged = merged.sort_values(["team_id", "stock_id", "master_timestamp"]).reset_index(drop=True)
    merged.to_csv(out / "master_validation.csv", index=False)

    ok, report = leak_check(files, truths)
    (out / "leak_report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")

    up_share = new_val["target_r1r2"].mean()
    print(f"Generated {len(pairs)} team files across {len({s for _, s in pairs})} stocks in {out}")
    print(f"Round 1 window {PRED_START}-{PRED_END}: {up_share:.1%} UP")
    print(f"master_validation.csv: {len(new_val)} new Round 1 rows, {len(keep)} existing rows kept")
    print("\n".join(report[:2]))
    if not ok:
        print("LEAK CHECK FAILED. Do not use these files. See leak_report.txt.")
        return 1
    print("Leak check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
