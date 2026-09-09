import { type ReactNode, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronRight, Clock3, Crosshair, Database, LockKeyhole, Pause, Play, RefreshCw, ShieldAlert, Target, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import {
  getGetTradingAnalysisQueryKey,
  getGetTradingOverviewQueryKey,
  getHealthCheckQueryKey,
  getListTradingAlertsQueryKey,
  getListTradingTradesQueryKey,
  useCreatePaperTrade,
  useGetBotControl,
  useGetTradingAnalysis,
  useGetTradingOverview,
  useHealthCheck,
  useListTradingAlerts,
} from '@workspace/api-client-react';

const money = (value?: number | null) => typeof value === 'number' ? `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const price = (value?: number | null) => typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const titleCase = (value?: string) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div><p className="font-mono-ui text-[9px] uppercase tracking-[.2em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-.03em]">{title}</h2></div>{action}</div>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const overview = useGetTradingOverview({ query: { queryKey: getGetTradingOverviewQueryKey() } });
  const analysis = useGetTradingAnalysis({ query: { queryKey: getGetTradingAnalysisQueryKey() } });
  const bot = useGetBotControl();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const alerts = useListTradingAlerts();
  const createPaperTrade = useCreatePaperTrade();

  const isLoading = overview.isLoading || analysis.isLoading || bot.isLoading;
  const overviewData = overview.data;
  const analysisData = analysis.data;
  const botData = bot.data;
  const alertData = alerts.data ?? [];
  const healthUp = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const setupReady = analysisData?.setup?.status?.toLowerCase().includes('ready') || analysisData?.setup?.status?.toLowerCase().includes('valid');
  const createLabel = createPaperTrade.isPending ? 'Recording setup…' : 'Simulate paper entry';

  const spark = useMemo(() => [28, 33, 31, 39, 36, 42, 48, 44, 52, 55, 61, 58, 66, 64, 70], []);

  const recordSetup = () => {
    if (!analysisData?.setup) return;
    createPaperTrade.mutate({
      data: {
        symbol: analysisData.symbol === 'ETH/USDT' ? 'ETH/USDT' : 'BTC/USDT',
        side: analysisData.bias === 'short' ? 'short' : 'long',
        entry: analysisData.setup.entry,
        stopLoss: analysisData.setup.stopLoss,
        target: analysisData.setup.target,
        session: analysisData.session,
        setup: 'SMC validated setup',
      },
    }, {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListTradingTradesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetTradingOverviewQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListTradingAlertsQueryKey() }),
        ]);
      },
    });
  };

  return (
    <div className="space-y-7">
      <div className="enter-rise flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-secondary"><span className="pulse-dot h-2 w-2 rounded-full bg-secondary" /> Market operator / paper session</div>
          <h1 className="text-[clamp(27px,4vw,44px)] font-extrabold leading-[.98] tracking-[-.055em]">Control room<span className="text-accent">.</span></h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Validate the sequence. Respect the invalidation. Every decision here is simulated by design.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-right"><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Session</p><p className="mt-1 text-[12px] font-bold">{titleCase(overviewData?.session)}</p></div>
          <div className={`rounded-lg border px-3 py-2 text-right ${healthUp ? 'border-secondary/40 bg-secondary/10' : 'border-accent/40 bg-accent/10'}`}><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Core</p><p className="mt-1 flex items-center gap-1.5 text-[12px] font-bold">{healthUp ? <><span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Nominal</> : <><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Check</>}</p></div>
        </div>
      </div>

      {overview.isError || analysis.isError || bot.isError ? <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-[12px]"><span className="flex items-center gap-2"><ShieldAlert size={15} /> Some market data is unavailable. The paper lock remains active.</span><button onClick={() => { overview.refetch(); analysis.refetch(); bot.refetch(); }} className="flex items-center gap-2 font-bold" data-testid="button-retry-dashboard"><RefreshCw size={14} /> Retry</button></div> : null}

      <section className="enter-rise enter-rise-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? [1, 2, 3, 4].map((n) => <div key={n} className="rounded-xl border border-border bg-card p-4"><Skeleton className="h-3 w-20" /><Skeleton className="mt-4 h-7 w-28" /><Skeleton className="mt-3 h-2 w-32" /></div>) : <>
          <MetricCard label="Paper equity" value={money(overviewData?.equity)} sub="Simulated account balance" icon={<Database size={16} />} tone="ink" />
          <MetricCard label="Today's P&L" value={money(overviewData?.todayPnl)} sub={`${overviewData?.winRate?.toFixed(1) ?? '—'}% win rate`} icon={overviewData?.todayPnl && overviewData.todayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} tone={overviewData?.todayPnl && overviewData.todayPnl >= 0 ? 'lime' : 'coral'} />
          <MetricCard label="Trades today" value={`${overviewData?.tradesToday ?? '—'} / ${overviewData?.maxTradesPerDay ?? '—'}`} sub="Daily risk budget" icon={<Crosshair size={16} />} tone="coral" />
          <MetricCard label="Active symbol" value={overviewData?.symbol ?? '—'} sub={`Last sync ${overviewData?.lastSync ? new Date(overviewData.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}`} icon={<Activity size={16} />} tone="blue" />
        </>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <section className="enter-rise enter-rise-2">
          <SectionHeading eyebrow={`Market pulse / ${analysisData?.timeframe ?? 'live'}`} title="Market snapshot" action={<span className="font-mono-ui text-[10px] text-muted-foreground">{overviewData?.symbol ?? 'BTC/USDT'} · {titleCase(overviewData?.session)}</span>} />
          <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 scanline">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="font-mono-ui text-[10px] uppercase tracking-[.17em] text-muted-foreground">{analysisData?.symbol ?? overviewData?.symbol ?? 'BTC/USDT'} / perpetual</p><div className="mt-2 flex items-baseline gap-3"><span className="font-mono-ui text-3xl font-medium tracking-[-.06em]">{price(analysisData?.setup?.entry)}</span><span className="flex items-center gap-1 font-mono-ui text-[11px] text-secondary"><TrendingUp size={13} /> monitored</span></div></div>
              <div className="rounded-lg border border-border bg-background/60 px-3 py-2"><p className="font-mono-ui text-[9px] uppercase tracking-[.15em] text-muted-foreground">Trend / bias</p><p className={`mt-1 text-[12px] font-extrabold ${analysisData?.trend === 'bearish' ? 'text-accent' : 'text-secondary'}`}>{titleCase(analysisData?.trend)} <span className="px-1 text-muted-foreground">/</span> {titleCase(analysisData?.bias)}</p></div>
            </div>
            <div className="mt-6 flex h-[126px] items-end gap-1 border-b border-l border-border/70 px-2 pb-2 pt-4">
              {spark.map((height, index) => <div key={index} className={`flex-1 rounded-t-[3px] transition-transform hover:-translate-y-1 ${index > 9 ? 'bg-accent/80' : 'bg-primary/75'}`} style={{ height: `${height + (index % 3) * 4}%` }} />)}
              <div className="absolute bottom-[69px] left-5 right-5 border-t border-dashed border-accent/50"><span className="absolute -top-5 right-0 font-mono-ui text-[9px] text-accent">liquidity line</span></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Asian range" value={`${price(analysisData?.asianRange?.low)} — ${price(analysisData?.asianRange?.high)}`} />
              <Stat label="Range state" value={titleCase(analysisData?.asianRange?.status)} />
              <Stat label="Confidence" value={`${analysisData?.confidence ?? '—'}%`} accent />
            </div>
          </div>
        </section>

        <section className="enter-rise enter-rise-3">
          <SectionHeading eyebrow="Execution gate / no impulse" title="Next actions" />
          <div className="rounded-xl border border-sidebar bg-sidebar p-5 text-sidebar-foreground shadow-sm">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.17em] text-sidebar-primary"><span className="pulse-dot h-2 w-2 rounded-full bg-sidebar-primary" /> Rule engine</span><span className="font-mono-ui text-[10px] text-sidebar-foreground/45">{analysisData?.timeframe ?? '15m'}</span></div>
            <p className="mt-6 text-[24px] font-extrabold leading-[1.02] tracking-[-.04em]">{setupReady ? 'Setup is reviewable.' : 'Wait for confirmation.'}</p>
            <p className="mt-3 text-[12px] leading-relaxed text-sidebar-foreground/55">{setupReady ? 'Structure, liquidity and location have aligned. Read the invalidation before recording a simulated entry.' : 'No qualified setup has cleared the current rule gate. Patience is an active position.'}</p>
            <button disabled={!setupReady || createPaperTrade.isPending} onClick={recordSetup} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-4 py-3 text-[12px] font-extrabold text-sidebar-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-create-paper-trade"><Play size={14} fill="currentColor" /> {createLabel}</button>
            <Link href="/journal" className="mt-3 flex items-center justify-center gap-1 text-[11px] font-semibold text-sidebar-foreground/55 hover:text-sidebar-foreground" data-testid="link-open-journal">Review journal <ChevronRight size={13} /></Link>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <section className="enter-rise enter-rise-2">
          <SectionHeading eyebrow="SMC framework / audited" title="Analysis stack" action={<span className="flex items-center gap-1.5 font-mono-ui text-[10px] text-muted-foreground"><Clock3 size={12} /> {analysisData?.checkedAt ? new Date(analysisData.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>} />
          <div className="grid gap-3 sm:grid-cols-2">
            <AnalysisCard icon={<BarChart3 size={15} />} title="Structure" items={analysisData?.structure} tone="lime" />
            <AnalysisCard icon={<Zap size={15} />} title="Liquidity / sweep" items={analysisData?.liquidity} tone="coral" />
            <AnalysisCard icon={<Target size={15} />} title="Validated levels" items={[`Entry ${price(analysisData?.setup?.entry)}`, `Stop ${price(analysisData?.setup?.stopLoss)}`, `Target ${price(analysisData?.setup?.target)}`, `R:R ${analysisData?.setup?.riskReward ?? '—'}`]} tone="blue" />
            <AnalysisCard icon={<ShieldAlert size={15} />} title="Invalidation" items={analysisData?.invalidation} tone="ink" />
          </div>
        </section>

        <section className="enter-rise enter-rise-3">
          <SectionHeading eyebrow="Runtime / safeguards" title="Bot state" action={<Link href="/settings" className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground hover:text-foreground" data-testid="link-bot-settings">Configure <ChevronRight size={12} className="inline" /></Link>} />
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-4"><div className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-lg ${botData?.running ? 'bg-secondary/20 text-secondary' : 'bg-muted text-muted-foreground'}`}>{botData?.running ? <Play size={16} fill="currentColor" /> : <Pause size={16} />}</div><div><p className="text-[13px] font-extrabold">{botData?.running ? 'Monitoring active' : 'Monitoring paused'}</p><p className="mt-0.5 font-mono-ui text-[9px] uppercase tracking-[.13em] text-muted-foreground">{titleCase(botData?.mode)} / orders locked</p></div></div><span className={`rounded-full px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[.1em] ${botData?.running ? 'bg-secondary/15 text-secondary' : 'bg-muted text-muted-foreground'}`}>{botData?.running ? 'Running' : 'Paused'}</span></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5"><Stat label="Risk per trade" value={`${botData?.riskPerTrade ?? '—'}%`} /><Stat label="Trades / day" value={`${overviewData?.tradesToday ?? 0} / ${botData?.maxTradesPerDay ?? '—'}`} /><Stat label="Exchange" value={titleCase(botData?.exchangeStatus)} /><Stat label="Telegram" value={titleCase(botData?.telegramStatus)} /></div>
          </div>
        </section>
      </div>

      <section className="enter-rise enter-rise-3">
        <SectionHeading eyebrow="Delivery queue / immutable trail" title="Recent alerts" action={<span className="font-mono-ui text-[10px] text-muted-foreground">{alertData.length} events</span>} />
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {alerts.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : alertData.length === 0 ? <div className="flex items-center gap-3 p-6 text-[12px] text-muted-foreground"><Check size={16} className="text-secondary" /> No recent alert delivery events.</div> : <div className="divide-y divide-border">{alertData.slice(0, 4).map((alert) => <div key={alert.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Activity size={13} /></span><div className="min-w-0 flex-1"><p className="text-[12px] font-bold">{alert.title}</p><p className="truncate text-[11px] text-muted-foreground">{alert.body}</p></div><div className="flex items-center gap-3 font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground"><span className="text-secondary">{titleCase(alert.status)}</span><span>{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></div>)}</div>}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: ReactNode; tone: 'ink' | 'lime' | 'coral' | 'blue' }) {
  const toneClass = { ink: 'bg-primary text-primary-foreground', lime: 'bg-secondary/15 text-secondary', coral: 'bg-accent/15 text-accent', blue: 'bg-[#d9e9e8] text-[#28706f]' }[tone];
  return <div className="rounded-xl border border-border bg-card p-4 transition-transform hover:-translate-y-0.5" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><span className={`grid h-7 w-7 place-items-center rounded-md ${toneClass}`}>{icon}</span></div><p className="mt-4 font-mono-ui text-[23px] font-medium tracking-[-.06em]">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{sub}</p></div>;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className={`mt-1 text-[12px] font-bold ${accent ? 'text-accent' : ''}`}>{value}</p></div>;
}

function AnalysisCard({ icon, title, items, tone }: { icon: ReactNode; title: string; items?: string[]; tone: 'lime' | 'coral' | 'blue' | 'ink' }) {
  const dot = { lime: 'bg-secondary', coral: 'bg-accent', blue: 'bg-[#28706f]', ink: 'bg-primary' }[tone];
  return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-[12px] font-extrabold"><span className={`grid h-7 w-7 place-items-center rounded-md bg-muted ${tone === 'coral' ? 'text-accent' : tone === 'lime' ? 'text-secondary' : 'text-foreground'}`}>{icon}</span>{title}</div><div className="mt-3 space-y-2">{items?.length ? items.map((item, index) => <div key={`${item}-${index}`} className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />{item}</div>) : <p className="text-[11px] text-muted-foreground">No confirmation logged.</p>}</div></div>;
}