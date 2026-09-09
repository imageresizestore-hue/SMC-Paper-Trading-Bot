---
name: Paper worker runtime
description: Why the paper worker can run without private exchange or Telegram credentials
---

The paper worker intentionally uses CoinDCX's public candle endpoint for market data, while exchange credentials and Telegram remain optional integrations for future account diagnostics and notifications.

**Why:** Paper execution must be startable without granting private trading permissions, and optional reporting dependencies should never block simulated trading.

**How to apply:** Keep live order placement absent, keep the API safety lock authoritative, and treat notifications/charts as best-effort extras around the core paper loop.