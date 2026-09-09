"""Small CoinDCX adapter with safe credential handling.

The adapter supports public candles and signed private requests, but intentionally
does not expose an order-placement method. The first release uses the adapter for
paper-market data and connection readiness only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from urllib import parse, request

from smc_engine import Candle


class CoinDCXClient:
    public_base_url = "https://public.coindcx.com"
    private_base_url = "https://api.coindcx.com"

    def __init__(self) -> None:
        self.api_key = os.getenv("COINDCX_API_KEY")
        self.api_secret = os.getenv("COINDCX_API_SECRET")

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.api_secret)

    def _get_json(self, url: str) -> object:
        req = request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "SMC-Paper-Trader/1.0",
                "Origin": "https://coindcx.com",
                "Referer": "https://coindcx.com/",
            },
        )
        with request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))

    def candles(
        self,
        *,
        pair: str = "B-BTC_USDT",
        interval: str = "15m",
        limit: int = 200,
    ) -> list[Candle]:
        """Fetch public candles; no private credential is sent for this call."""

        query = parse.urlencode({"pair": pair, "interval": interval, "limit": min(limit, 500)})
        payload = self._get_json(f"{self.public_base_url}/market_data/candles/?{query}")
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise ValueError("CoinDCX returned an unexpected candle payload")

        candles: list[Candle] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            timestamp = row.get("time", row.get("timestamp"))
            if timestamp is None:
                continue
            timestamp_number = float(timestamp)
            if timestamp_number > 10_000_000_000:
                timestamp_number /= 1000
            candles.append(
                Candle(
                    timestamp=datetime.fromtimestamp(timestamp_number, tz=timezone.utc),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row.get("volume", 0)),
                )
            )
        return sorted(candles, key=lambda candle: candle.timestamp)

    def signed_post(self, path: str, payload: dict) -> object:
        """Make a signed request for read-only account diagnostics.

        No order endpoint is exposed by this adapter. Keep this method private to
        the readiness/connection layer and never log the signed payload.
        """

        if not self.configured:
            raise RuntimeError("CoinDCX credentials are not configured")
        body = {**payload, "timestamp": int(time.time() * 1000)}
        encoded = json.dumps(body, separators=(",", ":"))
        signature = hmac.new(
            self.api_secret.encode("utf-8"),
            encoded.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        req = request.Request(
            f"{self.private_base_url}{path}",
            data=encoded.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-AUTH-APIKEY": self.api_key,
                "X-AUTH-SIGNATURE": signature,
            },
            method="POST",
        )
        with request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))