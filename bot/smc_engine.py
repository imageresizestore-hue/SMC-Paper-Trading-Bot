"""Deterministic SMC analysis primitives for the paper-first trading pipeline.

The engine deliberately separates market reading from execution. It never places
an order by itself; callers must pass a validated setup to a broker adapter.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, time
from enum import Enum
from typing import Iterable, Sequence
from zoneinfo import ZoneInfo


IST = ZoneInfo("Asia/Kolkata")


class Bias(str, Enum):
    LONG = "long"
    SHORT = "short"
    NEUTRAL = "neutral"


class Trend(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    RANGING = "ranging"
    UNCLEAR = "unclear"


@dataclass(frozen=True)
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass(frozen=True)
class AsianRange:
    low: float
    high: float
    candle_count: int


@dataclass(frozen=True)
class Structure:
    trend: Trend
    bias: Bias
    bos: bool
    choch: bool
    reason: str


@dataclass(frozen=True)
class FVG:
    direction: Bias
    low: float
    high: float
    midpoint: float


@dataclass(frozen=True)
class Setup:
    valid: bool
    bias: Bias
    entry: float | None
    stop_loss: float | None
    target: float | None
    risk_reward: float | None
    session: str
    reasons: tuple[str, ...]
    invalidation: tuple[str, ...]

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class TradeAudit:
    grade: str
    verdict: str
    reasons: tuple[str, ...]
    checklist: tuple[tuple[str, bool], ...]

    def as_dict(self) -> dict:
        return {
            "grade": self.grade,
            "verdict": self.verdict,
            "reasons": list(self.reasons),
            "checklist": [
                {"label": label, "passed": passed}
                for label, passed in self.checklist
            ],
        }


def current_session(now: datetime | None = None) -> str:
    """Return the IST session used by the bot's hard session gate."""

    local = (now or datetime.now(IST)).astimezone(IST)
    clock = local.time()
    if time(6, 0) <= clock < time(12, 30):
        return "asian"
    if time(12, 30) <= clock < time(17, 30):
        return "london"
    if time(17, 30) <= clock < time(23, 0):
        return "new_york"
    return "outside"


def asian_range(candles: Sequence[Candle]) -> AsianRange | None:
    """Build the Asian range from candles between 06:00 and 12:30 IST."""

    asian = [
        candle
        for candle in candles
        if time(6, 0) <= candle.timestamp.astimezone(IST).time() < time(12, 30)
    ]
    if not asian:
        return None
    return AsianRange(
        low=min(candle.low for candle in asian),
        high=max(candle.high for candle in asian),
        candle_count=len(asian),
    )


def _recent_swings(candles: Sequence[Candle]) -> tuple[list[float], list[float]]:
    highs: list[float] = []
    lows: list[float] = []
    for index in range(1, len(candles) - 1):
        before, candle, after = candles[index - 1 : index + 2]
        if candle.high > before.high and candle.high > after.high:
            highs.append(candle.high)
        if candle.low < before.low and candle.low < after.low:
            lows.append(candle.low)
    return highs, lows


def read_structure(candles: Sequence[Candle]) -> Structure:
    """Read directional structure from confirmed three-candle swing points."""

    if len(candles) < 7:
        return Structure(Trend.UNCLEAR, Bias.NEUTRAL, False, False, "Not enough candles")

    highs, lows = _recent_swings(candles)
    if len(highs) < 2 or len(lows) < 2:
        return Structure(Trend.UNCLEAR, Bias.NEUTRAL, False, False, "No confirmed swing structure")

    bullish = highs[-1] > highs[-2] and lows[-1] > lows[-2]
    bearish = highs[-1] < highs[-2] and lows[-1] < lows[-2]
    if bullish:
        return Structure(Trend.BULLISH, Bias.LONG, True, False, "Higher highs and higher lows")
    if bearish:
        return Structure(Trend.BEARISH, Bias.SHORT, True, False, "Lower highs and lower lows")
    return Structure(Trend.RANGING, Bias.NEUTRAL, False, True, "Swing sequence is mixed; wait for displacement")


def liquidity_sweep(candles: Sequence[Candle], range_: AsianRange) -> tuple[bool, bool]:
    """Return (sell-side sweep, buy-side sweep) from the latest confirmed candle."""

    if not candles:
        return False, False
    latest = candles[-1]
    return latest.low < range_.low and latest.close > range_.low, latest.high > range_.high and latest.close < range_.high


def find_fvg(candles: Sequence[Candle], direction: Bias) -> FVG | None:
    """Find the latest three-candle fair value gap in the requested direction."""

    for first, _, third in reversed(list(zip(candles, candles[1:], candles[2:]))):
        if direction == Bias.LONG and third.low > first.high:
            return FVG(direction, first.high, third.low, (first.high + third.low) / 2)
        if direction == Bias.SHORT and third.high < first.low:
            return FVG(direction, third.high, first.low, (third.high + first.low) / 2)
    return None


def validate_setup(
    higher_timeframe: Sequence[Candle],
    entry_timeframe: Sequence[Candle],
    now: datetime | None = None,
) -> Setup:
    """Validate a paper setup in the required SMC order."""

    session = current_session(now)
    range_ = asian_range(higher_timeframe)
    structure = read_structure(higher_timeframe)
    reasons: list[str] = []
    invalidation: list[str] = []
    if session not in {"asian", "london", "new_york"}:
        return Setup(False, Bias.NEUTRAL, None, None, None, None, session, ("Outside the configured Asian/London/New York sessions",), ("Session filter failed",))
    if range_ is None:
        return Setup(False, Bias.NEUTRAL, None, None, None, None, session, ("Asian range is not available",), ("Wait for the Asian range",))
    if structure.bias == Bias.NEUTRAL:
        return Setup(False, Bias.NEUTRAL, None, None, None, None, session, (structure.reason,), ("Wait for BOS/CHoCH confirmation",))

    sell_side, buy_side = liquidity_sweep(entry_timeframe, range_)
    expected_sweep = sell_side if structure.bias == Bias.LONG else buy_side
    if not expected_sweep:
        return Setup(False, structure.bias, None, None, None, None, session, ("Required liquidity sweep is not confirmed",), ("No sweep; do not anticipate the entry",))
    reasons.append("Asian range liquidity swept")

    fvg = find_fvg(entry_timeframe, structure.bias)
    if fvg is None:
        return Setup(False, structure.bias, None, None, None, None, session, tuple(reasons + ["No directional FVG after sweep"]), ("Wait for displacement and FVG",))
    reasons.extend([structure.reason, "BOS/CHoCH displacement confirmed", "Directional FVG identified"])

    risk = abs(fvg.midpoint - (range_.low if structure.bias == Bias.LONG else range_.high))
    if risk <= 0:
        return Setup(False, structure.bias, None, None, None, None, session, tuple(reasons), ("Invalid risk distance",))
    target = fvg.midpoint + 2 * risk if structure.bias == Bias.LONG else fvg.midpoint - 2 * risk
    return Setup(
        True,
        structure.bias,
        fvg.midpoint,
        range_.low if structure.bias == Bias.LONG else range_.high,
        target,
        2.0,
        session,
        tuple(reasons),
        ("Close beyond the swept range", "Invalidate if displacement FVG is filled without reaction"),
    )


def audit_trade(
    setup: Setup,
    *,
    trend_confirmed: bool,
    sweep_confirmed: bool,
    displacement_confirmed: bool,
    session_allowed: bool,
    risk_reward_ok: bool,
    outcome: str,
) -> TradeAudit:
    """Explain a trade outcome with the exact rule that failed or passed."""

    checklist = (
        ("Trend read before entry", trend_confirmed),
        ("Asian range liquidity mapped", sweep_confirmed),
        ("BOS or CHoCH displacement confirmed", displacement_confirmed),
        ("London/New York session active", session_allowed),
        ("Risk/reward at least 1:2", risk_reward_ok),
    )
    failed = [label for label, passed in checklist if not passed]
    if outcome == "won" and not failed:
        return TradeAudit("A", "valid_trade", ("All mandatory SMC gates passed",), checklist)
    if failed:
        return TradeAudit(
            "C",
            "wrong_trade",
            tuple(f"{label} failed" for label in failed),
            checklist,
        )
    return TradeAudit("B", "needs_review", ("Outcome and structure disagree; review the candle sequence",), checklist)