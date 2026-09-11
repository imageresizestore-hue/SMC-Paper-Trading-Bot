type Trend = "bullish" | "bearish" | "ranging" | "unclear";
type Bias = "long" | "short" | "neutral";

export type MarketCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TimeframeRead = {
  timeframe: string;
  trend: Trend;
  bias: Bias;
  bos: boolean;
  choch: boolean;
  swingHigh: number | null;
  swingLow: number | null;
  fvgLow: number | null;
  fvgHigh: number | null;
  lastClose: number | null;
  status: "confirmed" | "sideways" | "unclear";
  reason: string;
};

export type AnalysisSeries = {
  timeframe: string;
  candles: MarketCandle[];
  levels: Array<{ label: string; value: number; tone: "structure" | "fvg" | "entry" | "risk" | "target" }>;
};

const TIMEFRAMES = ["1d", "1h", "30m", "15m", "5m", "1m"] as const;
const PAIR = "B-BTC_USDT";
const PUBLIC_CANDLE_URL = "https://public.coindcx.com/market_data/candles/";

async function fetchCandles(interval: string): Promise<MarketCandle[]> {
  const url = new URL(PUBLIC_CANDLE_URL);
  url.searchParams.set("pair", PAIR);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", "200");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "SMC-Paper-Trader/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Public market data returned ${response.status}`);
  const payload = await response.json() as { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const rows = Array.isArray(payload) ? payload : payload.data;
  if (!rows) throw new Error("Public market data returned no candle list");
  return rows
    .map((row) => {
      const rawTime = Number(row.time ?? row.timestamp);
      const timestamp = rawTime > 10_000_000_000 ? rawTime : rawTime * 1000;
      return {
        timestamp: new Date(timestamp).toISOString(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0),
      };
    })
    .filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.close))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function swings(candles: MarketCandle[]): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let index = 1; index < candles.length - 1; index += 1) {
    const before = candles[index - 1];
    const candle = candles[index];
    const after = candles[index + 1];
    if (candle.high > before.high && candle.high > after.high) highs.push(candle.high);
    if (candle.low < before.low && candle.low < after.low) lows.push(candle.low);
  }
  return { highs, lows };
}

function timeframeRead(timeframe: string, candles: MarketCandle[]): TimeframeRead {
  const { highs, lows } = swings(candles);
  const bullish = highs.length >= 2 && lows.length >= 2
    && highs.at(-1)! > highs.at(-2)! && lows.at(-1)! > lows.at(-2)!;
  const bearish = highs.length >= 2 && lows.length >= 2
    && highs.at(-1)! < highs.at(-2)! && lows.at(-1)! < lows.at(-2)!;
  const trend: Trend = bullish ? "bullish" : bearish ? "bearish" : highs.length >= 2 && lows.length >= 2 ? "ranging" : "unclear";
  const bias: Bias = bullish ? "long" : bearish ? "short" : "neutral";
  const fvg = bias === "neutral" ? null : [...Array(Math.max(0, candles.length - 2)).keys()]
    .reverse()
    .map((index) => {
      const first = candles[index];
      const third = candles[index + 2];
      if (bias === "long" && third.low > first.high) return { low: first.high, high: third.low };
      if (bias === "short" && third.high < first.low) return { low: third.high, high: first.low };
      return null;
    })
    .find(Boolean) ?? null;
  return {
    timeframe,
    trend,
    bias,
    bos: bullish || bearish,
    choch: trend === "ranging",
    swingHigh: highs.at(-1) ?? null,
    swingLow: lows.at(-1) ?? null,
    fvgLow: fvg?.low ?? null,
    fvgHigh: fvg?.high ?? null,
    lastClose: candles.at(-1)?.close ?? null,
    status: trend === "bullish" || trend === "bearish" ? "confirmed" : trend === "ranging" ? "sideways" : "unclear",
    reason: bullish ? "Higher highs and higher lows" : bearish ? "Lower highs and lower lows" : trend === "ranging" ? "Swing sequence is mixed; wait for displacement" : "No confirmed swing structure",
  };
}

function asianRange(candles: MarketCandle[]) {
  const asian = candles.filter((candle) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(candle.timestamp));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    const total = hour * 60 + minute;
    return total >= 360 && total < 750;
  });
  if (!asian.length) return null;
  return { low: Math.min(...asian.map((candle) => candle.low)), high: Math.max(...asian.map((candle) => candle.high)) };
}

function currentSession(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const total = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  if (total >= 360 && total < 750) return "Asian session active";
  if (total >= 750 && total < 1050) return "London session active";
  if (total >= 1050 && total < 1380) return "New York session active";
  return "Outside configured sessions";
}

export async function buildLiveMarketAnalysis() {
  const candlesByTimeframe = Object.fromEntries(
    await Promise.all(TIMEFRAMES.map(async (timeframe) => [timeframe, await fetchCandles(timeframe)])),
  ) as Record<string, MarketCandle[]>;
  const reads = TIMEFRAMES.map((timeframe) => timeframeRead(timeframe, candlesByTimeframe[timeframe]));
  const firstBias = reads[0].bias;
  const aligned = firstBias !== "neutral"
    && reads.every((read) => read.bias === firstBias && read.status === "confirmed");
  const trend: Trend = aligned ? (firstBias === "long" ? "bullish" : "bearish") : reads[0].trend;
  const bias: Bias = aligned ? firstBias : "neutral";
  const range = asianRange(candlesByTimeframe["15m"]);
  const entryCandles = candlesByTimeframe["5m"];
  const latest = entryCandles.at(-1);
  const sellSweep = Boolean(range && latest && latest.low < range.low && latest.close > range.low);
  const buySweep = Boolean(range && latest && latest.high > range.high && latest.close < range.high);
  const entryRead = reads.find((read) => read.timeframe === "5m")!;
  const setupAllowed = aligned && currentSession() !== "Outside configured sessions"
    && ((bias === "long" && sellSweep) || (bias === "short" && buySweep))
    && entryRead.fvgLow !== null && entryRead.fvgHigh !== null;
  const entry = setupAllowed ? (entryRead.fvgLow! + entryRead.fvgHigh!) / 2 : null;
  const stopLoss = setupAllowed && range ? bias === "long" ? range.low : range.high : null;
  const risk = entry !== null && stopLoss !== null ? Math.abs(entry - stopLoss) : null;
  const target = risk !== null ? entry! + (bias === "long" ? 2 * risk : -2 * risk) : null;
  const series: AnalysisSeries[] = TIMEFRAMES.map((timeframe) => {
    const read = reads.find((item) => item.timeframe === timeframe)!;
    const levels = [
      read.swingHigh !== null ? { label: "Swing high", value: read.swingHigh, tone: "structure" as const } : null,
      read.swingLow !== null ? { label: "Swing low", value: read.swingLow, tone: "structure" as const } : null,
      read.fvgLow !== null ? { label: "FVG low", value: read.fvgLow, tone: "fvg" as const } : null,
      read.fvgHigh !== null ? { label: "FVG high", value: read.fvgHigh, tone: "fvg" as const } : null,
      timeframe === "5m" && entry !== null ? { label: "Entry", value: entry, tone: "entry" as const } : null,
      timeframe === "5m" && stopLoss !== null ? { label: "Stop", value: stopLoss, tone: "risk" as const } : null,
      timeframe === "5m" && target !== null ? { label: "Target", value: target, tone: "target" as const } : null,
    ].filter((level): level is NonNullable<typeof level> => Boolean(level));
    return { timeframe, candles: candlesByTimeframe[timeframe].slice(-60), levels };
  });
  const alignedCount = reads.filter((read) => read.bias === firstBias && read.status === "confirmed").length;
  return {
    symbol: "BTC/USDT",
    timeframe: "1D → 1H → 30M → 15M → 5M → 1M",
    trend,
    bias,
    confidence: aligned ? 92 : Math.min(68, 25 + alignedCount * 8),
    session: currentSession(),
    asianRange: {
      low: range?.low ?? 0,
      high: range?.high ?? 0,
      status: sellSweep ? "Sell-side swept; range reclaimed" : buySweep ? "Buy-side swept; range rejected" : "Waiting for a confirmed range sweep",
    },
    structure: reads.map((read) => `${read.timeframe}: ${read.trend} structure — ${read.reason}`),
    liquidity: [
      sellSweep ? "Sell-side liquidity below Asian low taken" : "No confirmed sell-side sweep",
      buySweep ? "Buy-side liquidity above Asian high taken" : "No confirmed buy-side sweep",
      aligned ? "Lower-timeframe move agrees with 1D/1H direction" : "Lower-timeframe break is blocked until higher timeframes agree",
    ],
    reasons: aligned
      ? ["All six timeframes agree", "1D and 1H direction confirmed", "30M and 15M displacement aligned", "5M and 1M entry confirmation aligned"]
      : ["No trade until all six timeframes confirm one direction", ...reads.filter((read) => read.status !== "confirmed").map((read) => `${read.timeframe} is ${read.status}`)],
    timeframes: reads,
    chart: { series },
    setup: {
      status: setupAllowed ? "Validated paper setup" : "Wait for multi-timeframe confirmation",
      entry,
      stopLoss,
      target,
      riskReward: risk !== null && risk > 0 ? 2 : 0,
    },
    invalidation: [
      "Reject if 1D or 1H structure changes against the bias",
      "Reject if 30M/15M closes fail to confirm displacement",
      "Reject isolated 5M/1M breaks without higher-timeframe alignment",
      "Reject sideways or unclear timeframes",
    ],
    checkedAt: new Date().toISOString(),
  };
}