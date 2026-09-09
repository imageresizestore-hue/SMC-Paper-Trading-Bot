import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Check, ChevronRight, CircleCheck, ExternalLink, Gauge, LockKeyhole, RefreshCw, Save, Server, ShieldCheck, SlidersHorizontal, Smartphone, Wifi, XCircle } from 'lucide-react';
import { getGetBotControlQueryKey, useGetBotControl, useHealthCheck, useUpdateBotControl } from '@workspace/api-client-react';

const titleCase = (value?: string) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

export default function Settings() {
  const queryClient = useQueryClient();
  const botQuery = useGetBotControl();
  const healthQuery = useHealthCheck();
  const updateBot = useUpdateBotControl();
  const [running, setRunning] = useState(false);
  const [risk, setRisk] = useState(0.5);
  const [maxTrades, setMaxTrades] = useState(3);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (botQuery.data) {
      setRunning(botQuery.data.running);
      setRisk(botQuery.data.riskPerTrade);
      setMaxTrades(botQuery.data.maxTradesPerDay);
      setDirty(false);
    }
  }, [botQuery.data]);

  const saveControls = () => {
    updateBot.mutate({ data: { running, riskPerTrade: Number(risk), maxTradesPerDay: Number(maxTrades) } }, {
      onSuccess: (next) => {
        queryClient.setQueryData(getGetBotControlQueryKey(), next);
        setDirty(false);
      },
    });
  };

  const connectionRows = [
    { label: 'Core API', detail: 'Health endpoint', status: healthQuery.data?.status === 'ok' || healthQuery.data?.status === 'healthy' ? 'Connected' : healthQuery.isLoading ? 'Checking' : 'Needs review', good: healthQuery.data?.status === 'ok' || healthQuery.data?.status === 'healthy', icon: Server },
    { label: 'Exchange adapter', detail: 'Paper market data only', status: titleCase(botQuery.data?.exchangeStatus), good: botQuery.data?.exchangeStatus === 'configured', icon: Wifi },
    { label: 'Telegram delivery', detail: 'Alert notifications', status: titleCase(botQuery.data?.telegramStatus), good: botQuery.data?.telegramStatus === 'ready', icon: Smartphone },
  ];

  return (
    <div className="space-y-7">
      <div className="enter-rise flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-secondary"><SlidersHorizontal size={13} /> Operating parameters</div><h1 className="text-[clamp(27px,4vw,44px)] font-extrabold leading-[.98] tracking-[-.055em]">Paper controls<span className="text-accent">.</span></h1><p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Tune the simulator's boundaries. The live venue stays behind a hard lock.</p></div>
        <Link href="/" className="flex items-center gap-2 self-start rounded-lg border border-border bg-card px-4 py-2.5 text-[11px] font-bold hover:bg-muted md:self-auto" data-testid="link-settings-control-room">Control room <ChevronRight size={14} /></Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <section className="enter-rise enter-rise-1 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-start"><div><p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-muted-foreground">Runtime configuration</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-.03em]">Guardrails</h2><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">These values affect paper monitoring and simulated entries only.</p></div><div className="flex items-center gap-2 rounded-full bg-secondary/15 px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[.1em] text-secondary"><LockKeyhole size={11} /> live locked</div></div>
            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between gap-4"><div><p className="text-[12px] font-extrabold">Monitoring engine</p><p className="mt-1 text-[11px] text-muted-foreground">Scan for rule-qualified setups</p></div><button role="switch" aria-checked={running} onClick={() => { setRunning(!running); setDirty(true); }} className={`relative h-7 w-12 rounded-full transition-colors ${running ? 'bg-secondary' : 'bg-muted'}`} data-testid="switch-monitoring-engine"><span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${running ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
              <div><div className="flex items-center justify-between"><div><p className="text-[12px] font-extrabold">Risk per simulated trade</p><p className="mt-1 text-[11px] text-muted-foreground">Account risk allocation</p></div><span className="font-mono-ui text-[13px] font-medium text-accent">{risk.toFixed(1)}%</span></div><input type="range" min="0.1" max="2" step="0.1" value={risk} onChange={(event) => { setRisk(Number(event.target.value)); setDirty(true); }} className="mt-4 h-1.5 w-full cursor-pointer accent-[hsl(var(--accent))]" data-testid="input-risk-per-trade" /><div className="mt-2 flex justify-between font-mono-ui text-[9px] text-muted-foreground"><span>0.1% conservative</span><span>2.0% ceiling</span></div></div>
              <div><div className="flex items-center justify-between"><div><p className="text-[12px] font-extrabold">Maximum trades per day</p><p className="mt-1 text-[11px] text-muted-foreground">Stops new paper entries after the cap</p></div><span className="font-mono-ui text-[13px] font-medium text-accent">{maxTrades}</span></div><div className="mt-4 grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => { setMaxTrades(value); setDirty(true); }} className={`h-9 rounded-md font-mono-ui text-[11px] font-medium ${maxTrades === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} data-testid={`button-max-trades-${value}`}>{value}</button>)}</div></div>
            </div>
            <div className="mt-7 flex flex-col items-start justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center"><p className="text-[10px] text-muted-foreground">{dirty ? 'Unsaved changes ready to apply.' : 'Controls synchronized with the paper worker.'}</p><button disabled={!dirty || updateBot.isPending} onClick={saveControls} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[11px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-save-controls"><Save size={14} /> {updateBot.isPending ? 'Applying…' : 'Apply controls'}</button></div>
            {updateBot.isError && <p className="mt-3 flex items-center gap-2 text-[11px] text-accent"><XCircle size={14} /> Could not apply controls. Try again.</p>}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 sm:p-6"><p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-muted-foreground">Instrument scope</p><h2 className="mt-1 text-[17px] font-extrabold tracking-[-.03em]">Market coverage</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{['BTC/USDT', 'ETH/USDT'].map((symbol, index) => <div key={symbol} className={`flex items-center justify-between rounded-lg border p-4 ${index === 0 ? 'border-secondary/35 bg-secondary/5' : 'border-border bg-muted/30'}`}><div><p className="font-mono-ui text-[13px] font-medium">{symbol}</p><p className="mt-1 text-[10px] text-muted-foreground">SMC multi-timeframe</p></div><span className="flex items-center gap-1.5 font-mono-ui text-[9px] uppercase tracking-[.1em] text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Allowed</span></div>)}</div></div>
        </section>

        <section className="enter-rise enter-rise-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><Gauge size={16} className="text-secondary" /><h2 className="text-[15px] font-extrabold">Connection status</h2></div><div className="mt-5 divide-y divide-border">{connectionRows.map(({ label, detail, status, good, icon: Icon }) => <div key={label} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"><div className={`grid h-8 w-8 place-items-center rounded-lg ${good ? 'bg-secondary/15 text-secondary' : 'bg-accent/12 text-accent'}`}><Icon size={15} /></div><div className="min-w-0 flex-1"><p className="text-[12px] font-bold">{label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p></div><div className={`flex items-center gap-1.5 font-mono-ui text-[9px] uppercase tracking-[.08em] ${good ? 'text-secondary' : 'text-muted-foreground'}`}>{good ? <CircleCheck size={12} /> : <RefreshCw size={11} />}{status}</div></div>)}</div></div>
          <div className="relative overflow-hidden rounded-xl border border-sidebar bg-sidebar p-5 text-sidebar-foreground sm:p-6"><div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[20px] border-sidebar-primary/10" /><div className="relative"><div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.16em] text-sidebar-primary"><ShieldCheck size={14} /> Safety lock information</div><h2 className="mt-5 text-[20px] font-extrabold leading-tight tracking-[-.04em]">Real money cannot move<br />from this cockpit.</h2><p className="mt-4 text-[11px] leading-relaxed text-sidebar-foreground/60">The worker is configured for paper execution. Live order placement is not exposed in the frontend, and the current runtime mode is <strong className="text-sidebar-foreground">{titleCase(botQuery.data?.mode) || 'Paper'}</strong>.</p><div className="mt-6 space-y-3 border-t border-sidebar-border pt-5 text-[11px]"><div className="flex items-center gap-2"><Check size={13} className="text-sidebar-primary" /> Paper trade creation only</div><div className="flex items-center gap-2"><Check size={13} className="text-sidebar-primary" /> Exchange orders disabled</div><div className="flex items-center gap-2"><Check size={13} className="text-sidebar-primary" /> Every close writes an audit</div></div></div></div>
          <div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center gap-2 text-[12px] font-extrabold"><ExternalLink size={14} className="text-muted-foreground" /> Operator notes</div><p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Review setup quality in the journal before changing the risk budget. A paused engine never deletes the audit trail.</p></div>
        </section>
      </div>
    </div>
  );
}