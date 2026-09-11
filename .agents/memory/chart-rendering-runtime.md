---
name: Telegram chart rendering runtime
description: Runtime dependency needed for the paper worker's generated multi-timeframe Telegram charts
---

The paper worker's chart delivery path depends on Python matplotlib being available in the runtime; without it, paper analysis can run but chart rendering/test delivery fails before the text fallback.

**Why:** Chart delivery is an optional reporting layer, but the requested Telegram photo alert cannot be verified or sent without the renderer dependency.

**How to apply:** Keep matplotlib installed for workflows or deployment environments that use `bot/charting.py`, while preserving the text notification fallback so paper execution remains independent.