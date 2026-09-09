"""Minimal multi-timeframe SMC chart rendering for Telegram reports."""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

try:
    from .smc_engine import Candle, Setup, asian_range, find_fvg, read_structure
except ImportError:
    from smc_engine import Candle, Setup, asian_range, find_fvg, read_structure


def _candles(ax, candles: list[Candle], title: str) -> None:
    visible = candles[-80:]
    width = 0.006 if len(visible) > 30 else 0.012
    for candle in visible:
        x = mdates.date2num(candle.timestamp)
        color = "#7fe0b2" if candle.close >= candle.open else "#f08a8a"
        ax.vlines(x, candle.low, candle.high, color=color, linewidth=0.8, alpha=0.9)
        ax.add_patch(
            Rectangle(
                (x - width / 2, min(candle.open, candle.close)),
                width,
                max(abs(candle.close - candle.open), 0.00001),
                facecolor=color,
                edgecolor=color,
                alpha=0.88,
            )
        )
    ax.set_title(title, loc="left", fontsize=10, color="#dce5ee", pad=8)
    ax.grid(axis="y", alpha=0.12)
    ax.tick_params(axis="both", colors="#9fb0c0", labelsize=8)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b %H:%M"))


def render_setup_chart(
    *,
    symbol: str,
    higher: list[Candle],
    entry: list[Candle],
    setup: Setup,
    output_path: str,
) -> None:
    plt.style.use("dark_background")
    figure, axes = plt.subplots(
        2,
        1,
        figsize=(13, 8),
        gridspec_kw={"height_ratios": [1, 1.3]},
        constrained_layout=True,
    )
    figure.patch.set_facecolor("#111a2a")
    for axis in axes:
        axis.set_facecolor("#162235")
    _candles(axes[0], higher, "Higher timeframe • 1H structure")
    _candles(axes[1], entry, "Entry timeframe • 15m sweep / displacement / FVG")

    range_ = asian_range(higher)
    structure = read_structure(higher)
    fvg = find_fvg(entry, setup.bias)
    for axis in axes:
        if range_:
            axis.axhline(range_.low, color="#f3b562", linestyle="--", linewidth=0.9, alpha=0.8)
            axis.axhline(range_.high, color="#f3b562", linestyle="--", linewidth=0.9, alpha=0.8)
        if setup.entry is not None:
            axis.axhline(setup.entry, color="#62d6c7", linewidth=1.1, label="Entry")
        if setup.stop_loss is not None:
            axis.axhline(setup.stop_loss, color="#f08a8a", linewidth=1.0, label="Stop")
        if setup.target is not None:
            axis.axhline(setup.target, color="#7fe0b2", linewidth=1.0, label="Target")
    if fvg:
        axes[1].axhspan(fvg.low, fvg.high, color="#62d6c7", alpha=0.12, label="FVG")

    figure.suptitle(
        f"{symbol} • SMC PAPER SETUP • {setup.bias.value.upper()} • {setup.session.replace('_', ' ').title()}",
        color="#f5f7fa",
        fontsize=14,
        fontweight="bold",
    )
    figure.text(
        0.01,
        0.01,
        f"Trend: {structure.trend.value}  |  Bias: {structure.bias.value}  |  "
        "Paper only • not financial advice • no live order",
        color="#9fb0c0",
        fontsize=9,
    )
    figure.savefig(output_path, dpi=150, facecolor=figure.get_facecolor())
    plt.close(figure)