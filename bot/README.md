# SMC Trading Pipeline

The Python layer is paper-first and execution-agnostic:

1. Read higher-timeframe structure.
2. Mark the Asian range in IST.
3. Require a London/New York session.
4. Require a liquidity sweep.
5. Require BOS/CHoCH displacement and a directional FVG.
6. Calculate entry, stop, target, and minimum 1:2 risk/reward.
7. Open a paper trade only after all gates pass.
8. Audit every closed trade with a rule-by-rule checklist.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are optional Replit Secrets. The
runner never prints them. `LIVE_TRADING_UNLOCKED` is intentionally not used by
this first version; live order execution must be added only after a separate
validation milestone.