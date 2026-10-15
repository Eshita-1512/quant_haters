"""
Synthetic Stock Dataset Generator — STOCK_A
============================================
Generates 3 files:
  1. STOCK_A_synthetic_master.csv  → Full internal reference (organizers only)
  2. STOCK_A_round1_public.csv     → What participants download (no targets, no post-crash data initially)
  3. master_validation.csv         → Secret answer key for the backend scoring engine

Flash Crash Architecture:
  - Days 1–1000  : Normal GBM market (low volatility, mild upward drift)
  - Day 1001     : Flash crash day (single-day drop of -10% to -15%)
  - Days 1002–2001: Post-crash volatile regime (high volatility, downward drift)
"""

import pandas as pd
import numpy as np

# ─────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────
SEED = 42
ASSET_ID = "STOCK_A"
START_DATE = "2018-01-01"
TOTAL_DAYS = 2001         # Total trading days to generate
CRASH_DAY = 1001          # Index (1-based) of the flash crash day
S0 = 250.0                # Starting price

# Pre-crash GBM parameters (annualized)
PRE_MU = 0.08             # 8% annual drift
PRE_SIGMA = 0.18          # 18% annual volatility

# Flash crash parameters
CRASH_RETURN = -0.12      # -12% single-day drop

# Post-crash GBM parameters (annualized)
POST_MU = -0.05           # -5% annual drift (bearish recovery)
POST_SIGMA = 0.42         # 42% annual volatility (very high chaos)

# Participant prediction window (what goes into validation CSV)
# Each team predicts 50 days. Example window for STOCK_A:
PREDICTION_START = 1701   # Day 1701 (row index, 1-based)
PREDICTION_END = 1750     # Day 1750

np.random.seed(SEED)

# ─────────────────────────────────────────
# STEP 1: GENERATE GBM PRICE PATH
# ─────────────────────────────────────────

def gbm_segment(S_start, mu, sigma, n_days):
    """Generate n_days of GBM returns and prices starting from S_start."""
    dt = 1 / 252
    daily_returns = np.exp(
        (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * np.random.standard_normal(n_days)
    ) - 1
    prices = [S_start]
    for r in daily_returns:
        prices.append(prices[-1] * (1 + r))
    return np.array(prices[1:]), daily_returns


# Pre-crash segment: days 1 to CRASH_DAY-1
n_pre = CRASH_DAY - 1
pre_prices, pre_returns = gbm_segment(S0, PRE_MU, PRE_SIGMA, n_pre)

# Flash crash: single day
crash_price = pre_prices[-1] * (1 + CRASH_RETURN)

# Post-crash segment: days CRASH_DAY+1 to TOTAL_DAYS
n_post = TOTAL_DAYS - CRASH_DAY
post_prices, post_returns = gbm_segment(crash_price, POST_MU, POST_SIGMA, n_post)

# Combine into full price array
all_prices = np.concatenate([pre_prices, [crash_price], post_prices])
all_returns = np.concatenate([pre_returns, [CRASH_RETURN], post_returns])

print(f"Price path: {S0:.2f} -> crash at day {CRASH_DAY} ({crash_price:.2f}) -> end {all_prices[-1]:.2f}")

# ─────────────────────────────────────────
# STEP 2: GENERATE TRADING DATES
# ─────────────────────────────────────────

all_dates = pd.bdate_range(start=START_DATE, periods=TOTAL_DAYS)

# ─────────────────────────────────────────
# STEP 3: BUILD OHLCV
# ─────────────────────────────────────────

def build_ohlcv(close_prices, returns):
    n = len(close_prices)
    daily_range_pct = np.abs(np.random.normal(0.01, 0.005, n)).clip(0.002, 0.04)

    open_prices = close_prices * (1 - returns * np.random.uniform(0.3, 0.7, n))
    high_prices = close_prices * (1 + daily_range_pct * np.random.uniform(0.4, 1.0, n))
    low_prices  = close_prices * (1 - daily_range_pct * np.random.uniform(0.4, 1.0, n))

    # Ensure OHLC consistency: low <= min(open,close), high >= max(open,close)
    high_prices = np.maximum(high_prices, np.maximum(open_prices, close_prices))
    low_prices  = np.minimum(low_prices, np.minimum(open_prices, close_prices))

    # Base volume around 1.5M, higher on volatile days, very high on crash day
    vol_factor = 1 + 3 * np.abs(returns) / PRE_SIGMA
    base_volume = np.random.lognormal(np.log(1_500_000), 0.4, n)
    volumes = (base_volume * vol_factor).astype(int)

    return open_prices, high_prices, low_prices, volumes

open_p, high_p, low_p, volume = build_ohlcv(all_prices, all_returns)

# ─────────────────────────────────────────
# STEP 4: FEATURE ENGINEERING
# ─────────────────────────────────────────

df = pd.DataFrame({
    "timestamp": range(1, TOTAL_DAYS + 1),
    "date": all_dates.strftime("%Y-%m-%d"),
    "asset_id": ASSET_ID,
    "open": open_p.round(2),
    "high": high_p.round(2),
    "low": low_p.round(2),
    "close": all_prices.round(2),
    "volume": volume,
})

# Returns
df["return_1d"] = df["close"].pct_change().round(6)

# Moving averages
df["sma_10"]  = df["close"].rolling(10).mean().round(2)
df["sma_30"]  = df["close"].rolling(30).mean().round(2)

# Momentum: 5-day price change %
df["momentum_5"] = df["close"].pct_change(5).round(6)

# Volatility: 20-day rolling std of returns
df["volatility_20"] = df["return_1d"].rolling(20).std().round(6)

# RSI (14-day)
def compute_rsi(series, period=14):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return (100 - (100 / (1 + rs))).round(4)

df["rsi_14"] = compute_rsi(df["close"])

# Volume z-score (20-day)
df["volume_z_20"] = (
    (df["volume"] - df["volume"].rolling(20).mean()) /
    df["volume"].rolling(20).std()
).round(4)

# Order flow (simulated: positive = buying pressure, negative = selling)
df["order_flow"] = ((df["close"] - df["low"]) / (df["high"] - df["low"]) * 2 - 1).round(4)

# ─────────────────────────────────────────
# STEP 5: REGIME & CRASH FLAGS (FIXED!)
# ─────────────────────────────────────────

df["regime"] = 0
df.loc[df["timestamp"] >= CRASH_DAY, "regime"] = 1  # THE BUG FROM BEFORE, NOW FIXED

df["flash_crash_day"] = 0
df.loc[df["timestamp"] == CRASH_DAY, "flash_crash_day"] = 1

# ─────────────────────────────────────────
# STEP 6: TARGET LABELS (FIXED LOOKAHEAD!)
# ─────────────────────────────────────────

df["next_return"] = df["close"].pct_change().shift(-1).round(6)  # tomorrow's return
df["target"] = (df["next_return"] > 0).astype("Int64")           # 1=UP, 0=DOWN

# LOOKAHEAD FIX: Last row has no known future -> set to NaN
df.loc[df["timestamp"] == TOTAL_DAYS, ["next_return", "target"]] = pd.NA

# ─────────────────────────────────────────
# STEP 7: SAVE MASTER CSV (organizers only)
# ─────────────────────────────────────────

df_master = df.dropna(subset=["sma_30"])  # Drop first 30 rows with NaN features
df_master = df_master.reset_index(drop=True)
df_master.to_csv("STOCK_A_synthetic_master.csv", index=False)
print(f"\nSaved STOCK_A_synthetic_master.csv ({len(df_master)} rows)")

# Verify regime
print(f"   Regime 0 (normal): {(df_master['regime'] == 0).sum()} rows")
print(f"   Regime 1 (crash):  {(df_master['regime'] == 1).sum()} rows")
print(f"   Flash crash day:   {df_master[df_master['flash_crash_day'] == 1]['date'].values}")
print(f"   Crash-day return:  {df_master[df_master['flash_crash_day'] == 1]['return_1d'].values}")

# ─────────────────────────────────────────
# STEP 8: SAVE PUBLIC ROUND 1 CSV (participants)
# ─────────────────────────────────────────
# Participants get ALL rows (pre + post crash) BUT:
#   - No next_return or target columns (those are secret)
#   - No flash_crash_day column (spoils the surprise; admin reveals it live)

public_cols = [
    "timestamp", "date", "asset_id",
    "open", "high", "low", "close", "volume",
    "return_1d", "sma_10", "sma_30", "momentum_5",
    "volatility_20", "rsi_14", "volume_z_20", "order_flow"
    # NOTE: 'regime' intentionally excluded — participants must discover the regime shift themselves
]

df_public = df_master[public_cols].copy()
df_public.to_csv("STOCK_A_round1_public.csv", index=False)
print(f"\nSaved STOCK_A_round1_public.csv ({len(df_public)} rows, no secret columns)")

# ─────────────────────────────────────────
# STEP 9: SAVE MASTER VALIDATION CSV (backend only - SECRET)
# ─────────────────────────────────────────

pred_mask = (
    (df_master["timestamp"] >= PREDICTION_START) &
    (df_master["timestamp"] <= PREDICTION_END)
)
df_validation = df_master[pred_mask][["timestamp", "date", "asset_id", "next_return", "target"]].copy()
df_validation = df_validation.dropna(subset=["target"])
df_validation.to_csv("master_validation.csv", index=False)
print(f"\nSaved master_validation.csv ({len(df_validation)} rows - KEEP THIS SECRET)")
print(f"   Prediction window: Day {PREDICTION_START} to {PREDICTION_END}")
print(f"   Date window: {df_validation['date'].min()} -> {df_validation['date'].max()}")
print(f"   Target distribution: {df_validation['target'].value_counts().to_dict()}")

# ─────────────────────────────────────────
# STEP 10: QUALITY REPORT
# ─────────────────────────────────────────

print("\n" + "=" * 50)
print("QUALITY REPORT")
print("=" * 50)
pre_vol  = df_master[df_master["regime"] == 0]["return_1d"].std() * (252**0.5)
post_vol = df_master[df_master["regime"] == 1]["return_1d"].std() * (252**0.5)
print(f"Pre-crash annualized vol:  {pre_vol:.2%}")
print(f"Post-crash annualized vol: {post_vol:.2%}")
print(f"Volatility spike ratio:    {post_vol/pre_vol:.1f}x")
print(f"RSI range: [{df_master['rsi_14'].min():.1f}, {df_master['rsi_14'].max():.1f}]")
print(f"Class balance: {df_master['target'].mean():.2%} UP")
print(f"Missing values: {df_master.isnull().sum().sum()}")
