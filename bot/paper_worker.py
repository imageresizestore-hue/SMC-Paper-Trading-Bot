"""Continuous paper-trading worker.

This process is deliberately separate from the API server. It reads public
CoinDCX candles, asks the SMC engine for a validated setup, records paper
entries/exits through the trading API, and sends the same event to Telegram.
It never exposes a live-order endpoint and never places an exchange order.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from datetime import datetime, timezone
from urllib import error, request

from coindcx_client import CoinDCXClient
from run_bot import TelegramNotifier
from smc_engine import (
    TIMEFRAME_ORDER,
    Setup,
    MultiTimeframeAnalysis,
    analyze_multi_timeframe,
    asian_range,
    find_fvg,
    liquidity_sweep,
    validate_multi_timeframe_setup,
)


# The paper worker talks to the shared local proxy by default, so it can reach
# the managed API artifact without hard-coding that artifact's private port.
API_BASE = os.getenv("PAPER_API_URL", "http://127.0.0.1:80/api").rstrip("/")
POLL_SECONDS = max(30, int(os.getenv("SMC_PAPER_POLL_SECONDS", "60")))
PAIR_BY_SYMBOL = {"BTC/USDT": "B-BTC_USDT", "ETH/USDT": "B-ETH_USDT"}


def api_json(path: str, *, method: str = "GET", payload: dict | None = None) -> object:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{API_BASE}{path}", data=body, headers=headers, method=method)
    with request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def fmt_price(value: float | None) -> str:
    return "—" if value is None else f"{value:,.2f}"


def setup_message(
    symbol: str,
    setup: Setup,
    trade: dict,
    analysis: MultiTimeframeAnalysis,
) -> str:
    return "\n".join(
        [
            "SMC PAPER TRADE OPENED",
            f"Symbol: {symbol}",
            f"Session: {setup.session.replace('_', ' ').title()}",
            f"Side: {setup.bias.value.upper()}",
            f"Multi-timeframe confidence: {analysis.confidence}%",
            f"Entry: {fmt_price(trade.get('entry'))}",
            f"Stop loss: {fmt_price(trade.get('stopLoss'))}",
            f"Target: {fmt_price(trade.get('target'))}",
            f"Risk/reward: {trade.get('riskReward', setup.risk_reward):.2f}",
            "Timeframe checks:",
            *[
                f"- {read.timeframe}: {read.trend.value} / {read.bias.value} / {read.status}"
                for read in analysis.reads
            ],
            "Reason: " + "; ".join(setup.reasons[:5]),
            "Invalidation: " + "; ".join(setup.invalidation),
            "Paper only — no live order was placed.",
        ]
    )


def close_message(trade: dict, closed: dict) -> str:
    pnl = float(closed.get("pnl") or 0)
    entry = float(trade.get("entry") or 0)
    pnl_pct = (pnl / entry * 100) if entry else 0
    outcome = "PROFIT" if pnl >= 0 else "LOSS"
    audit = closed.get("audit") or {}
    reasons = audit.get("reasons") or []
    return "\n".join(
        [
            f"SMC PAPER TRADE CLOSED — {outcome}",
            f"Symbol: {trade.get('symbol', '—')}",
            f"Side: {str(trade.get('side', '')).upper()}",
            f"Entry: {fmt_price(trade.get('entry'))}",
            f"Exit: {fmt_price(closed.get('exit'))}",
            f"P/L: {pnl:+.2f} ({pnl_pct:+.3f}%)",
            f"Status: {str(closed.get('status', '')).upper()}",
            f"Audit: {audit.get('grade', '—')} / {audit.get('verdict', '—')}",
            "Audit reasons: " + "; ".join(reasons),
            "Paper only — no live order was placed.",
        ]
    )


def get_open_trade() -> dict | None:
    payload = api_json("/trading/trades?status=open")
    if not isinstance(payload, list) or not payload:
        return None
    return payload[0]


def automated_trades_today() -> int:
    """Count only trades created by this worker, not the dashboard demo seed."""

    payload = api_json("/trading/trades?status=all")
    today = datetime.now(timezone.utc).date().isoformat()
    if not isinstance(payload, list):
        return 0
    return sum(
        1
        for trade in payload
        if isinstance(trade, dict)
        and str(trade.get("openedAt", "")).startswith(today)
        and str(trade.get("setup", "")).startswith("Automated SMC:")
    )


def close_if_target_or_stop(client: CoinDCXClient, trade: dict, notifier: TelegramNotifier) -> bool:
    pair = PAIR_BY_SYMBOL.get(str(trade.get("symbol")), "B-BTC_USDT")
    candles = client.candles(pair=pair, interval="5m", limit=3)
    if not candles:
        return False
    latest = candles[-1]
    side = trade.get("side")
    stop = float(trade["stopLoss"])
    target = float(trade["target"])
    exit_price: float | None = None
    verdict = ""
    if side == "long":
        if latest.low <= stop:
            exit_price, verdict = stop, "Automated paper close: stop loss was touched."
        elif latest.high >= target:
            exit_price, verdict = target, "Automated paper close: target was touched."
    elif side == "short":
        if latest.high >= stop:
            exit_price, verdict = stop, "Automated paper close: stop loss was touched."
        elif latest.low <= target:
            exit_price, verdict = target, "Automated paper close: target was touched."
    if exit_price is None:
        return False

    closed = api_json(
        f"/trading/trades/{trade['id']}/close",
        method="POST",
        payload={"exit": exit_price, "verdict": verdict},
    )
    if isinstance(closed, dict):
        notifier.send(close_message(trade, closed))
        print(json.dumps({"status": "paper_trade_closed", "trade_id": trade["id"]}), flush=True)
    return True


def open_validated_setup(
    client: CoinDCXClient,
    notifier: TelegramNotifier,
    *,
    symbol: str,
    pair: str,
    max_trades_per_day: int,
    trades_today: int,
) -> bool:
    if trades_today >= max_trades_per_day:
        return False
    candles_by_timeframe = {
        timeframe: client.candles(pair=pair, interval=timeframe, limit=200)
        for timeframe in TIMEFRAME_ORDER
    }
    setup, analysis = validate_multi_timeframe_setup(candles_by_timeframe)
    if not setup.valid or setup.entry is None or setup.stop_loss is None or setup.target is None:
        return False

    trade = api_json(
        "/trading/trades/paper",
        method="POST",
        payload={
            "symbol": symbol,
            "side": setup.bias.value,
            "entry": setup.entry,
            "stopLoss": setup.stop_loss,
            "target": setup.target,
            "session": setup.session,
            "setup": "Automated SMC: " + " → ".join(setup.reasons),
        },
    )
    if isinstance(trade, dict):
        report = setup_message(symbol, setup, trade, analysis)
        if notifier.ready:
            try:
                from charting import render_multi_timeframe_chart

                with tempfile.NamedTemporaryFile(prefix="smc-paper-", suffix=".png") as chart:
                    render_multi_timeframe_chart(
                        symbol=symbol,
                        candles_by_timeframe=candles_by_timeframe,
                        reads=list(analysis.reads),
                        setup=setup,
                        output_path=chart.name,
                    )
                    if not notifier.send_photo(chart.name, report):
                        notifier.send(report)
            except ModuleNotFoundError:
                # Telegram is optional; a missing charting dependency must not
                # stop paper execution or prevent the text report.
                notifier.send(report)
        else:
            print(report, flush=True)
        print(json.dumps({"status": "paper_trade_opened", "trade_id": trade["id"]}), flush=True)
    return True


def run_cycle(client: CoinDCXClient, notifier: TelegramNotifier) -> None:
    control = api_json("/trading/control")
    if not isinstance(control, dict):
        return
    if (
        control.get("mode") != "paper"
        or not control.get("running")
        or control.get("liveOrdersEnabled")
    ):
        return

    open_trade = get_open_trade()
    if open_trade is not None:
        close_if_target_or_stop(client, open_trade, notifier)
        return

    for symbol, pair in (("BTC/USDT", "B-BTC_USDT"), ("ETH/USDT", "B-ETH_USDT")):
        if open_validated_setup(
            client,
            notifier,
            symbol=symbol,
            pair=pair,
            max_trades_per_day=int(control.get("maxTradesPerDay", 1)),
            trades_today=automated_trades_today(),
        ):
            break


def main() -> None:
    client = CoinDCXClient()
    notifier = TelegramNotifier()

    print(json.dumps({
        "status": "running",
        "mode": "paper",
        "poll_seconds": POLL_SECONDS,
        "live_orders": False,
        "market_data": "public CoinDCX candles",
        "telegram_ready": notifier.ready,
    }), flush=True)

    while True:
        try:
            run_cycle(client, notifier)
        except (TimeoutError, OSError, ValueError, error.HTTPError) as exc:
            print(json.dumps({
                "status": "cycle_error",
                "error_type": type(exc).__name__,
                "at": datetime.now(timezone.utc).isoformat(),
            }), flush=True)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()