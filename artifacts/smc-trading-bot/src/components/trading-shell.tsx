import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, BookOpen, ChevronRight, CircleHelp, LockKeyhole, Menu, Settings2, ShieldCheck, X } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Control room', icon: Activity },
  { href: '/journal', label: 'Trade journal', icon: BookOpen },
  { href: '/settings', label: 'Paper controls', icon: Settings2 },
];

export function TradingShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-sidebar-primary text-sidebar-primary-foreground">
              <span className="font-mono-ui text-sm font-bold">S/</span>
            </span>
            <span>
              <span className="block text-[13px] font-extrabold tracking-[.13em]">SPECTRUM</span>
              <span className="mt-0.5 block font-mono-ui text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/50">paper execution</span>
            </span>
          </Link>
          <button className="text-sidebar-foreground/60 lg:hidden" onClick={() => setOpen(false)} data-testid="button-close-menu" aria-label="Close navigation"><X size={18} /></button>
        </div>

        <div className="mx-4 mt-5 rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/10 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-sidebar-primary"><span className="pulse-dot h-2 w-2 rounded-full bg-sidebar-primary" /> Paper only</div>
          <p className="mt-2 text-[11px] leading-relaxed text-sidebar-foreground/55">No exchange orders. Rules are reviewed before every simulated fill.</p>
        </div>

        <nav className="mt-8 px-3" aria-label="Primary navigation">
          <p className="mb-2 px-3 font-mono-ui text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/35">Workspace</p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-3 text-[12px] font-bold transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                <Icon size={16} strokeWidth={active ? 2.3 : 1.8} /><span>{label}</span>{active && <ChevronRight size={14} className="ml-auto text-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-4">
          <div className="border-t border-sidebar-border pt-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-sidebar-foreground/70"><ShieldCheck size={14} className="text-sidebar-primary" /> Safety lock active</div>
            <p className="mt-2 pl-6 font-mono-ui text-[9px] uppercase tracking-[.12em] text-sidebar-foreground/35">Live orders disabled</p>
          </div>
          <Link href="/settings" className="mt-5 flex items-center gap-2 px-1 text-[11px] text-sidebar-foreground/45 hover:text-sidebar-foreground" data-testid="link-help-settings"><CircleHelp size={14} /> Session diagnostics</Link>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-30 bg-sidebar/35 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" data-testid="button-overlay-menu" />}
      <main className="min-h-[100dvh] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-1.5 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} data-testid="button-open-menu" aria-label="Open navigation"><Menu size={20} /></button>
            <div className="hidden items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground sm:flex"><LockKeyhole size={13} className="text-accent" /> Simulation environment <span className="mx-1 text-border">/</span> Rule-set SMC v2.4</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground" data-testid="status-paper-header"><span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Paper mode</div>
            <div className="hidden items-center gap-2 font-mono-ui text-[10px] text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-secondary" /> UTC 14:32:08</div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</div>
      </main>
    </div>
  );
}