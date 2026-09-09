import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  CreatePaperTradeBody,
  CreatePaperTradeResponse,
  CloseTradingTradeBody,
  CloseTradingTradeParams,
  CloseTradingTradeResponse,
  GetBotControlResponse,
  GetTradingAnalysisResponse,
  GetTradingOverviewResponse,
  GetTradingTradeParams,
  GetTradingTradeResponse,
  ListTradingAlertsResponse,
  ListTradingTradesQueryParams,
  ListTradingTradesResponse,
  UpdateBotControlBody,
  UpdateBotControlResponse,
} from "@workspace/api-zod";
import {
  alertsTable,
  botSettingsTable,
  db,
  tradesTable,
} from "@workspace/db";

const router: IRouter = Router();
const telegramReady = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
const exchangeConfigured = () => Boolean(process.env.COINDCX_API_KEY && process.env.COINDCX_API_SECRET);
const paperUniverse = "BTC/USDT + ETH/USDT";

function currentSession(): "asian" | "london" | "new_york" | "outside" {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
  const minutes = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()));
  const totalMinutes = hour * 60 + minutes;
  if (totalMinutes >= 360 && totalMinutes < 750) return "asian";
  if (totalMinutes >= 750 && totalMinutes < 1050) return "london";
  if (totalMinutes >= 1050 && totalMinutes < 1380) return "new_york";
  return "outside";
}

const initialAudit = {
  grade: "A",
  verdict: "validated_setup",
  reasons: [
    "Higher-timeframe direction agrees with the session bias",
    "Liquidity sweep and displacement were confirmed",
    "Entry was taken inside the validated FVG",
  ],
  checklist: [
    { label: "Trend read before entry", passed: true },
    { label: "Asian range liquidity mapped", passed: true },
    { label: "London/New York session active", passed: true },
    { label: "BOS or CHoCH confirmed", passed: true },
    { label: "FVG retest confirmed", passed: true },
    { label: "Risk/reward at least 1:2", passed: true },
  ],
};

const seedTrades = [
  {
    symbol: "BTC/USDT",
    side: "long",
    status: "won",
    entry: 112420,
    exit: 113180,
    stopLoss: 112020,
    target: 113180,
    pnl: 42.8,
    riskReward: 1.9,
    session: "london",
    setup: "Asian low sweep → bullish displacement → 15m FVG",
    confluences: ["HTF bullish", "Asian low swept", "BOS", "15m FVG", "London"],
    openedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    closedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    audit: initialAudit,
  },
  {
    symbol: "BTC/USDT",
    side: "short",
    status: "lost",
    entry: 111980,
    exit: 112260,
    stopLoss: 112260,
    target: 111420,
    pnl: -18.4,
    riskReward: 2.1,
    session: "new_york",
    setup: "Equal highs sweep → 5m FVG continuation",
    confluences: ["Equal highs", "5m FVG", "NY"],
    openedAt: new Date(Date.now() - 1000 * 60 * 60 * 28),
    closedAt: new Date(Date.now() - 1000 * 60 * 60 * 26),
    audit: {
      grade: "C",
      verdict: "wrong_trade",
      reasons: [
        "Higher-timeframe structure was still bullish",
        "The sweep did not create bearish displacement",
        "Entry was taken before a confirmed CHoCH",
      ],
      checklist: [
        { label: "Trend read before entry", passed: false },
        { label: "Asian range liquidity mapped", passed: true },
        { label: "London/New York session active", passed: true },
        { label: "BOS or CHoCH confirmed", passed: false },
        { label: "FVG retest confirmed", passed: true },
        { label: "Risk/reward at least 1:2", passed: true },
      ],
    },
  },
];

const analysis = {
  symbol: "BTC/USDT",
  timeframe: "1H → 15m → 5m",
  trend: "bullish" as const,
  bias: "long" as const,
  confidence: 78,
  session: "London session active",
  asianRange: {
    low: 111740,
    high: 112380,
    status: "Low swept; price reclaimed range",
  },
  structure: [
    "1H bullish market structure",
    "15m bullish BOS after sell-side sweep",
    "5m displacement left a clean FVG",
  ],
  liquidity: [
    "Sell-side liquidity below Asian low taken",
    "Buy-side liquidity rests above 113180",
  ],
  setup: {
    status: "Validated paper setup",
    entry: 112420,
    stopLoss: 112020,
    target: 113180,
    riskReward: 1.9,
  },
  invalidation: [
    "15m close back below 112020",
    "No displacement on FVG retest",
    "London close without entry confirmation",
  ],
  checkedAt: new Date().toISOString(),
};

async function ensureSeed(): Promise<void> {
  const [settings] = await db.select().from(botSettingsTable).limit(1);
  if (!settings) {
    await db.insert(botSettingsTable).values({
      mode: "paper",
      running: true,
      liveOrdersEnabled: false,
      symbol: "BTC/USDT",
      maxTradesPerDay: 1,
      riskPerTrade: 0.5,
      sessions: ["asian", "london", "new_york"],
      telegramStatus: "not_configured",
    });
  }

  const [existingTrade] = await db.select().from(tradesTable).limit(1);
  if (!existingTrade) {
    await db.insert(tradesTable).values(seedTrades);
  }

  const [existingAlert] = await db.select().from(alertsTable).limit(1);
  if (!existingAlert) {
    await db.insert(alertsTable).values([
      {
        type: "setup",
        title: "SMC setup validated",
        body: "Bullish reclaim after Asian low sweep. Paper entry is permitted after FVG retest.",
        status: "not_configured",
      },
      {
        type: "audit",
        title: "Loss audit completed",
        body: "Short trade failed because HTF bias stayed bullish and CHoCH was not confirmed.",
        status: "not_configured",
      },
    ]);
  }
}

function serializeTrade(trade: typeof tradesTable.$inferSelect) {
  return {
    ...trade,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt?.toISOString() ?? null,
    exit: trade.exit ?? null,
    pnl: trade.pnl ?? null,
    audit: trade.audit as typeof initialAudit,
  };
}

router.get("/trading/overview", async (_req, res): Promise<void> => {
  await ensureSeed();
  const [settings] = await db.select().from(botSettingsTable).limit(1);
  const trades = await db.select().from(tradesTable);
  const closed = trades.filter((trade) => trade.status === "won" || trade.status === "lost");
  const wins = closed.filter((trade) => trade.status === "won").length;
  const now = new Date();
  const todayPnl = trades
    .filter((trade) => trade.openedAt.toDateString() === now.toDateString())
    .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const cumulativePnl = closed.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const response = {
    mode: settings?.mode === "live" ? "live_locked" : "paper",
    symbol: paperUniverse,
    session: currentSession(),
    equity: 1500 + cumulativePnl,
    todayPnl: Math.round(todayPnl * 100) / 100,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
    tradesToday: trades.filter((trade) => trade.openedAt.toDateString() === new Date().toDateString()).length,
    maxTradesPerDay: settings?.maxTradesPerDay ?? 1,
    lastSync: new Date().toISOString(),
    telegramStatus: telegramReady() ? "ready" : settings?.telegramStatus ?? "not_configured",
    exchangeStatus: exchangeConfigured() ? "configured" : "not_configured",
  };
  res.json(GetTradingOverviewResponse.parse(response));
});

router.get("/trading/analysis", async (_req, res): Promise<void> => {
  res.json(GetTradingAnalysisResponse.parse(analysis));
});

router.get("/trading/trades", async (req, res): Promise<void> => {
  await ensureSeed();
  const parsedQuery = ListTradingTradesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { status } = parsedQuery.data;
  const trades = await db
    .select()
    .from(tradesTable)
    .where(status === "all" ? undefined : eq(tradesTable.status, status))
    .orderBy(desc(tradesTable.openedAt));
  res.json(ListTradingTradesResponse.parse(trades.map(serializeTrade)));
});

router.get("/trading/trades/:tradeId", async (req, res): Promise<void> => {
  const parsedParams = GetTradingTradeParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const [trade] = await db.select().from(tradesTable).where(eq(tradesTable.id, parsedParams.data.tradeId));
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json(GetTradingTradeResponse.parse(serializeTrade(trade)));
});

router.post("/trading/trades/paper", async (req, res): Promise<void> => {
  await ensureSeed();
  const parsedBody = CreatePaperTradeBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const input = parsedBody.data;
  const risk = Math.abs(input.entry - input.stopLoss);
  const reward = Math.abs(input.target - input.entry);
  const trade = {
    symbol: input.symbol ?? "BTC/USDT",
    side: input.side,
    status: "open",
    entry: input.entry,
    stopLoss: input.stopLoss,
    target: input.target,
    riskReward: risk ? reward / risk : 0,
    session: input.session,
    setup: input.setup,
    confluences: ["manual paper entry", "SMC confirmation pending"],
    audit: {
      ...initialAudit,
      grade: "B",
      verdict: "open_for_review",
      reasons: ["Paper trade created; live orders are locked", "Trade will be graded on close"],
    },
  };
  const [created] = await db.insert(tradesTable).values(trade).returning();
  res.status(201).json(CreatePaperTradeResponse.parse(serializeTrade(created)));
});

router.post("/trading/trades/:tradeId/close", async (req, res): Promise<void> => {
  const parsedParams = CloseTradingTradeParams.safeParse(req.params);
  const parsedBody = CloseTradingTradeBody.safeParse(req.body);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const [trade] = await db.select().from(tradesTable).where(eq(tradesTable.id, parsedParams.data.tradeId));
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  const isWin = trade.side === "long" ? parsedBody.data.exit >= trade.entry : parsedBody.data.exit <= trade.entry;
  const pnl = trade.side === "long"
    ? parsedBody.data.exit - trade.entry
    : trade.entry - parsedBody.data.exit;
  const updatedAudit = {
    ...(trade.audit as typeof initialAudit),
    verdict: isWin ? "valid_trade" : "wrong_trade",
    grade: isWin ? "A" : "C",
    reasons: isWin
      ? ["The trade closed in the planned direction", parsedBody.data.verdict]
      : ["The trade closed against the planned direction", parsedBody.data.verdict],
  };
  const [updated] = await db
    .update(tradesTable)
    .set({
      exit: parsedBody.data.exit,
      pnl,
      status: isWin ? "won" : "lost",
      closedAt: new Date(),
      audit: updatedAudit,
    })
    .where(eq(tradesTable.id, parsedParams.data.tradeId))
    .returning();
  res.json(CloseTradingTradeResponse.parse(serializeTrade(updated)));
});

router.get("/trading/control", async (_req, res): Promise<void> => {
  await ensureSeed();
  const [settings] = await db.select().from(botSettingsTable).limit(1);
  const response = {
    mode: "paper" as const,
    running: settings?.running ?? false,
    liveOrdersEnabled: false,
    symbol: paperUniverse,
    maxTradesPerDay: settings?.maxTradesPerDay ?? 1,
    riskPerTrade: settings?.riskPerTrade ?? 0.5,
    sessions: Array.from(new Set(["asian", ...(settings?.sessions ?? ["london", "new_york"])])),
    telegramStatus: telegramReady() ? "ready" : settings?.telegramStatus ?? "not_configured",
    exchangeStatus: exchangeConfigured() ? "configured" : "not_configured",
  };
  res.json(GetBotControlResponse.parse(response));
});

router.patch("/trading/control", async (req, res): Promise<void> => {
  await ensureSeed();
  const parsedBody = UpdateBotControlBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const [updated] = await db
    .update(botSettingsTable)
    .set(parsedBody.data)
    .where(eq(botSettingsTable.id, 1))
    .returning();
  const response = {
    mode: "paper" as const,
    running: updated.running,
    liveOrdersEnabled: false,
    symbol: paperUniverse,
    maxTradesPerDay: updated.maxTradesPerDay,
    riskPerTrade: updated.riskPerTrade,
    sessions: updated.sessions.includes("asian") ? updated.sessions : ["asian", ...updated.sessions],
    telegramStatus: telegramReady() ? "ready" : updated.telegramStatus,
    exchangeStatus: exchangeConfigured() ? "configured" : "not_configured",
  };
  res.json(UpdateBotControlResponse.parse(response));
});

router.get("/trading/alerts", async (_req, res): Promise<void> => {
  await ensureSeed();
  const alerts = await db.select().from(alertsTable).orderBy(desc(alertsTable.createdAt));
  res.json(ListTradingAlertsResponse.parse(alerts.map((alert) => ({
    ...alert,
    createdAt: alert.createdAt.toISOString(),
  }))));
});

export default router;