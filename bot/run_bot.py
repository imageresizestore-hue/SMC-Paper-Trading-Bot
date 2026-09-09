"""Paper-first runner for the SMC pipeline.

This runner is intentionally safe by default:
- it does not place live orders;
- it only emits a paper setup when every SMC gate passes;
- it sends Telegram only when explicit secrets are present;
- it reports rejected setups as diagnostic events instead of forcing a trade.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import parse, request

from smc_engine import Candle, Setup, audit_trade, validate_setup
from coindcx_client import CoinDCXClient


class TelegramNotifier:
    def __init__(self) -> None:
        self.token = os.getenv("TELEGRAM_BOT_TOKEN")
        self.chat_id = os.getenv("TELEGRAM_CHAT_ID")

    @property
    def ready(self) -> bool:
        return bool(self.token and self.chat_id)

    def send(self, message: str) -> bool:
        if not self.ready:
            return False
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        body = parse.urlencode({"chat_id": self.chat_id, "text": message}).encode()
        try:
            req = request.Request(url, data=body, method="POST")
            with request.urlopen(req, timeout=10) as response:
                return 200 <= response.status < 300
        except Exception:
            return False

    def send_photo(self, photo_path: str | Path, caption: str) -> bool:
        if not self.ready:
            return False
        boundary = "----SMCPaperReportBoundary"
        photo = Path(photo_path).read_bytes()
        chunks = [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="chat_id"\r\n\r\n',
            self.chat_id.encode(),
            b"\r\n",
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="caption"\r\n\r\n',
            caption.encode("utf-8"),
            b"\r\n",
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="photo"; filename="smc-paper-report.png"\r\n',
            b"Content-Type: image/png\r\n\r\n",
            photo,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
        try:
            req = request.Request(
                f"https://api.telegram.org/bot{self.token}/sendPhoto",
                data=b"".join(chunks),
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                method="POST",
            )
            with request.urlopen(req, timeout=20) as response:
                return 200 <= response.status < 300
        except Exception:
            return False


class PaperBroker:
    def open(self, setup: Setup) -> dict:
        if not setup.valid:
            raise ValueError("Cannot open a paper trade from an invalid setup")
        return {
            "mode": "paper",
            "side": setup.bias.value,
            "entry": setup.entry,
            "stop_loss": setup.stop_loss,
            "target": setup.target,
            "risk_reward": setup.risk_reward,
            "opened_at": datetime.now(timezone.utc).isoformat(),
        }


def format_setup_message(setup: Setup) -> str:
    return "\n".join(
        [
            "SMC PAPER SETUP",
            f"Session: {setup.session}",
            f"Bias: {setup.bias.value.upper()}",
            f"Entry: {setup.entry:.2f}",
            f"SL: {setup.stop_loss:.2f}",
            f"Target: {setup.target:.2f}",
            f"R:R: {setup.risk_reward:.2f}",
            "Reasons:",
            *[f"- {reason}" for reason in setup.reasons],
            "This is paper-only. No live order was placed.",
        ]
    )


def analyze_once(higher_timeframe: list[Candle], entry_timeframe: list[Candle]) -> dict:
    setup = validate_setup(higher_timeframe, entry_timeframe)
    result = {"setup": setup.as_dict(), "paper_only": True}
    if setup.valid:
        result["trade"] = PaperBroker().open(setup)
    return result


def main() -> None:
    notifier = TelegramNotifier()
    coindcx = CoinDCXClient()
    # A live market-data adapter will supply candles here. Keeping this runner
    # adapter-free prevents accidental exchange calls before credentials and
    # permissions are intentionally configured.
    print(json.dumps({
        "status": "ready",
        "paper_only": True,
        "telegram_ready": notifier.ready,
        "coindcx_configured": coindcx.configured,
        "live_orders": False,
    }))
    while os.getenv("SMC_RUN_ONCE", "false").lower() != "true":
        time.sleep(60)


if __name__ == "__main__":
    main()