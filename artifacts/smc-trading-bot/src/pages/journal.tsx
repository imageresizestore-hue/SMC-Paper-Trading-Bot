import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, ClipboardCheck, Filter, History, Search, X } from 'lucide-react';
import { getGetTradingOverviewQueryKey, getGetTradingTradeQueryKey, getListTradingAlertsQueryKey, getListTradingTradesQueryKey, useCloseTradingTrade, useGetTradingTrade, useListTradingTrades } from '@workspace/api-client-react';

const money = (value?: number | null) => typeof value === 'number' ? `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Open';
const price = (value?: number | null) => typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const titleCase = (value?: string) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
const statusOptions = ['all', 'open', 'won', 'lost', 'rejected'] as const;

export default function Journal() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exit, setExit] = useState('');
  const [verdict, setVerdict] = useState('Closed after review');
  const tradesQuery = useListTradingTrades({ status });
  const detailQuery = useGetTradingTrade(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getGetTradingTradeQueryKey(selectedId ?? 0) } });
  const closeTrade = useCloseTradingTrade();

  const trades = useMemo(() => (tradesQuery.data ?? []).filter((trade) => {
    const haystack = `${trade.symbol} ${trade.side} ${trade.setup} ${trade.session} ${trade.status}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [tradesQuery.data, search]);

  const selected = detailQuery.data;
  const submitClose = () => {
    if (!selectedId || !exit) return;
    closeTrade.mutate({ tradeId: selectedId, data: { exit: Number(exit), verdict } }, {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListTradingTradesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetTradingTradeQueryKey(selectedId) }),
          queryClient.invalidateQueries({ queryKey: getGetTradingOverviewQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListTradingAlertsQueryKey() }),
        ]);
        setExit('');
      },
    });
  };

  return (
    <div className="space-y-7">
      <div className="enter-rise flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-secondary"><History size={13} /> Decision archive</div><h1 className="text-[clamp(27px,4vw,44px)] font-extrabold leading-[.98] tracking-[-.055em]">Trade journal<span className="text-accent">.</span></h1><p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">A paper-only audit trail. Search the reasoning, not just the result.</p></div>
        <Link href="/" className="flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2.5 text-[11px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 md:self-auto" data-testid="link-back-control-room">Back to control room <ChevronRight size={14} /></Link>
      </div>

      <div className="enter-rise enter-rise-1 grid gap-3 sm:grid-cols-3">
        <JournalStat label="Visible records" value={`${trades.length}`} caption="Filtered paper trades" />
        <JournalStat label="Open positions" value={`${(tradesQuery.data ?? []).filter((trade) => trade.status === 'open').length}`} caption="Awaiting a rule-based exit" />
        <JournalStat label="Audit coverage" value={trades.length ? `${Math.round((trades.filter((trade) => trade.audit?.checklist?.length).length / trades.length) * 100)}%` : '—'} caption="Records with a checklist" />
      </div>

      <section className="enter-rise enter-rise-2 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-sm flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-muted-foreground focus:border-secondary" placeholder="Search symbol, setup, session…" data-testid="input-search-trades" /></div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0"><Filter size={14} className="mr-1 shrink-0 text-muted-foreground" />{statusOptions.map((option) => <button key={option} onClick={() => setStatus(option)} className={`whitespace-nowrap rounded-md px-3 py-2 font-mono-ui text-[10px] uppercase tracking-[.1em] transition-colors ${status === option ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} data-testid={`button-filter-${option}`}>{option}</button>)}</div>
        </div>
        {tradesQuery.isLoading ? <LoadingTable /> : tradesQuery.isError ? <div className="flex items-center justify-between p-8 text-[12px] text-accent"><span>Could not load the journal.</span><button onClick={() => tradesQuery.refetch()} className="font-bold underline" data-testid="button-retry-journal">Retry</button></div> : trades.length === 0 ? <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground"><ClipboardCheck size={20} /></div><h2 className="mt-4 text-[14px] font-extrabold">No matching paper trades</h2><p className="mt-2 max-w-xs text-[12px] leading-relaxed text-muted-foreground">{search ? 'Try a different query or clear the filters.' : 'Validated setups recorded from the control room will appear here.'}</p><Link href="/" className="mt-5 rounded-lg border border-border px-4 py-2 text-[11px] font-bold hover:bg-muted" data-testid="link-empty-journal-control-room">Go to control room</Link></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-muted/50 font-mono-ui text-[9px] uppercase tracking-[.15em] text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Trade / time</th><th className="px-4 py-3 font-medium">Side</th><th className="px-4 py-3 font-medium">Entry → exit</th><th className="px-4 py-3 font-medium">Risk / target</th><th className="px-4 py-3 font-medium">Result</th><th className="px-5 py-3 text-right font-medium">Audit</th></tr></thead><tbody className="divide-y divide-border">{trades.map((trade) => <tr key={trade.id} className="group transition-colors hover:bg-muted/35" data-testid={`row-trade-${trade.id}`}><td className="px-5 py-4"><button onClick={() => { setSelectedId(trade.id); setExit(trade.exit ? String(trade.exit) : ''); }} className="text-left" data-testid={`button-open-trade-${trade.id}`}><span className="flex items-center gap-2 text-[12px] font-extrabold">{trade.symbol}<span className="font-mono-ui text-[9px] font-normal text-muted-foreground">#{trade.id}</span></span><span className="mt-1 block font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground">{new Date(trade.openedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {titleCase(trade.session)}</span></button></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[.08em] ${trade.side === 'long' ? 'bg-secondary/15 text-secondary' : 'bg-accent/15 text-accent'}`}>{trade.side === 'long' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />} {trade.side}</span></td><td className="px-4 py-4 font-mono-ui text-[11px]"><span>{price(trade.entry)}</span><span className="px-2 text-muted-foreground">→</span><span className="text-muted-foreground">{price(trade.exit)}</span></td><td className="px-4 py-4"><div className="font-mono-ui text-[11px]">{price(trade.stopLoss)} <span className="text-muted-foreground">/</span> {price(trade.target)}</div><div className="mt-1 text-[10px] text-muted-foreground">{trade.riskReward}R</div></td><td className="px-4 py-4"><span className={`font-mono-ui text-[11px] font-medium ${trade.pnl && trade.pnl > 0 ? 'text-secondary' : trade.pnl && trade.pnl < 0 ? 'text-accent' : 'text-muted-foreground'}`}>{money(trade.pnl)}</span><span className="mt-1 block font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground">{titleCase(trade.status)}</span></td><td className="px-5 py-4 text-right"><button onClick={() => { setSelectedId(trade.id); setExit(trade.exit ? String(trade.exit) : ''); }} className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground" data-testid={`button-audit-trade-${trade.id}`}>{trade.audit?.grade ?? 'View'} <ChevronRight size={12} /></button></td></tr>)}</tbody></table></div>}
      </section>

      {selectedId !== null && <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true"><div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between border-b border-border p-5"><div><p className="font-mono-ui text-[9px] uppercase tracking-[.17em] text-muted-foreground">Paper trade / audit detail</p><h2 className="mt-1 text-[20px] font-extrabold tracking-[-.04em]">{selected?.symbol ?? 'Loading…'} <span className="font-mono-ui text-[12px] font-normal text-muted-foreground">#{selectedId}</span></h2></div><button onClick={() => setSelectedId(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-close-trade-detail" aria-label="Close trade detail"><X size={18} /></button></div>{detailQuery.isLoading ? <LoadingDetail /> : selected ? <div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><DetailStat label="Status" value={titleCase(selected.status)} /><DetailStat label="Side" value={titleCase(selected.side)} /><DetailStat label="Entry" value={price(selected.entry)} /><DetailStat label="Target" value={price(selected.target)} /></div><div className="rounded-lg border border-border bg-muted/40 p-4"><div className="flex items-center justify-between"><p className="text-[12px] font-extrabold">Rule audit / grade {selected.audit?.grade ?? '—'}</p><span className="rounded-full bg-secondary/15 px-2 py-1 font-mono-ui text-[9px] uppercase text-secondary">{selected.audit?.verdict ?? 'Pending'}</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{selected.audit?.reasons?.join(' · ') || 'No reasons recorded.'}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{selected.audit?.checklist?.map((item, index) => <div key={`${item.label}-${index}`} className="flex items-center gap-2 text-[11px] text-muted-foreground"><CheckCircle2 size={13} className={item.passed ? 'text-secondary' : 'text-accent'} />{item.label}</div>)}</div></div>{selected.status === 'open' && <div className="border-t border-border pt-5"><p className="text-[12px] font-extrabold">Close simulated position</p><p className="mt-1 text-[11px] text-muted-foreground">Record the observed exit only after reviewing the rule outcome.</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]"><input type="number" step="any" value={exit} onChange={(event) => setExit(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 font-mono-ui text-[12px] outline-none focus:border-secondary" placeholder="Exit price" data-testid="input-close-exit" /><input value={verdict} onChange={(event) => setVerdict(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-[12px] outline-none focus:border-secondary" placeholder="Verdict" data-testid="input-close-verdict" /><button disabled={!exit || closeTrade.isPending} onClick={submitClose} className="h-10 rounded-lg bg-primary px-4 text-[11px] font-bold text-primary-foreground disabled:opacity-45" data-testid="button-close-paper-trade">{closeTrade.isPending ? 'Saving…' : 'Close trade'}</button></div></div>}</div> : <div className="p-8 text-[12px] text-muted-foreground">Trade detail unavailable.</div>}</div></div>}
    </div>
  );
}

function JournalStat({ label, value, caption }: { label: string; value: string; caption: string }) { return <div className="rounded-xl border border-border bg-card p-4"><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><p className="mt-3 font-mono-ui text-2xl tracking-[-.06em]">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{caption}</p></div>; }
function DetailStat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background p-3"><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-1 text-[12px] font-bold">{value}</p></div>; }
function LoadingTable() { return <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded bg-muted" />)}</div>; }
function LoadingDetail() { return <div className="space-y-4 p-5"><div className="h-14 animate-pulse rounded bg-muted" /><div className="h-32 animate-pulse rounded bg-muted" /></div>; }