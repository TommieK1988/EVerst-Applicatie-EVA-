'use client';
import { useRouter } from 'next/navigation';
import React from 'react';
import {
  IconCheck, IconBell, IconBuilding, IconSparkle,
  IconSun, IconPlus, IconMore,
  IconTaken, IconOpdrachten, IconAanvragen, IconAgenda, IconServicedesk,
} from '../Icons';
import NieuweTaakDialog from '@/components/taken/NieuweTaakDialog';
import type { TaakMetDetails } from '@/lib/taken/supabase/database.types';
import type { DossierRij } from '@/components/dossiers/types';
import {
  getDossierSubstatus, AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_STATUSSEN,
} from '@/components/dossiers/types';
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken';
import { berekenWerkdagenDrempel } from '@/lib/agenda/werkdagen';

/* ── Weergave-limieten ───────────────────────────────────────
   Widgets zijn 460px hoog zonder interne scroll; deze aantallen
   passen binnen de beschikbare contenthoogte (±373px). */
const MAX_TAKEN         = 6;
const MAX_HERINNERINGEN = 5;
const MAX_DOSSIERS      = 7;
const MAX_NIEUWS        = 4;

/* ── Helpers ─────────────────────────────────────────────── */

function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function relativeDeadline(deadline: string | null): string {
  if (!deadline) return 'Geen deadline';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(deadline); d.setHours(0, 0, 0, 0);
  const diff  = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)  return 'Verlopen';
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Morgen';
  if (diff <= 7)  return 'Deze week';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function prioriteitLabel(p: string): string {
  if (p === 'urgent' || p === 'hoog') return 'hoog';
  if (p === 'normaal') return 'mid';
  return 'low';
}

function substatusLabel(dossier: DossierRij): string {
  const sub = getDossierSubstatus(dossier);
  const all = [...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN];
  return all.find(s => s.key === sub)?.label ?? sub ?? '—';
}

function servicedeskSubstatusLabel(dossier: DossierRij): string {
  const sub = dossier.servicedesk_substatus;
  return SERVICEDESK_STATUSSEN.find(s => s.key === sub)?.label ?? sub ?? '—';
}

function relativeNewsTime(pubDate: string): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const pub = new Date(d); pub.setHours(0, 0, 0, 0);
  if (pub.getTime() === today.getTime()) {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  if (pub.getTime() === yesterday.getTime()) return 'Gister';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/* ── WidgetShell ─────────────────────────────────────────── */
export function WidgetShell({
  title, subtitle, action, onAction, actionNode, Icon, children, compact, onMore,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  actionNode?: React.ReactNode;
  onMore?: () => void;
  Icon?: React.FC<{ size?: number }>;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: compact ? 16 : 18,
      display: 'flex', flexDirection: 'column',
      height: 460,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 12, paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
        minWidth: 0, flexShrink: 0,
      }}>
        {Icon && (
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'var(--bg-active)',
            display: 'grid', placeItems: 'center',
            color: 'var(--accent)', flexShrink: 0,
          }}>
            <Icon size={15}/>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
            color: 'var(--fg)', letterSpacing: '-0.005em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500,
              color: 'var(--fg-muted)', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{subtitle}</div>
          )}
        </div>
        {actionNode ?? (action && (
          <button onClick={onAction} style={{
            background: 'none', border: 'none',
            color: 'var(--accent)',
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', flexShrink: 1, minWidth: 0, padding: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{action}</button>
        ))}
        {onMore && (
          <button
            onClick={onMore}
            style={{
              background: 'none', border: 'none', color: 'var(--fg-muted)',
              cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0, padding: 0,
            }}
          >
            <IconMore size={16}/>
          </button>
        )}
      </div>
      <div style={{
        flex: 1,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </section>
  );
}

/* ── PriDot ─────────────────────────────────────────────── */
function PriDot({ p }: { p: string }) {
  const c = p === 'hoog' ? '#d04a2a' : p === 'mid' ? '#d9a036' : 'var(--fg-muted)';
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }}/>;
}

/* ── TasksWidget ─────────────────────────────────────────── */
export function TasksWidget({ taken }: { taken: TaakMetDetails[] }) {
  const router = useRouter();
  const [doneIds, setDoneIds] = React.useState<Set<string>>(new Set());
  const [, startTransition] = React.useTransition();

  const toggle = (id: string) => {
    setDoneIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    startTransition(async () => {
      try { await updateTaakStatus(id, 'gereed'); } catch { /* optimistic — no revert needed */ }
    });
  };

  const displayed = taken.slice(0, MAX_TAKEN);
  const open = displayed.filter(t => !doneIds.has(t.id)).length;

  return (
    <WidgetShell
      title="Mijn taken"
      subtitle={`${open} open · ${doneIds.size} afgerond`}
      actionNode={
        <NieuweTaakDialog
          toonDossierPicker
          onSuccess={() => router.refresh()}
          trigger={
            <button style={{
              background: 'none', border: 'none',
              color: 'var(--accent)',
              fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', padding: 0,
            }}>
              + Nieuw
            </button>
          }
        />
      }
      Icon={IconTaken}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayed.length === 0 && (
          <div style={{ padding: '16px 2px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
            Geen taken toegewezen.
          </div>
        )}
        {displayed.map((t, i) => {
          const done     = doneIds.has(t.id);
          const due      = relativeDeadline(t.deadline);
          const pri      = prioriteitLabel(t.prioriteit);
          const dossierHref = t.dossier_sectie && t.dossier_id
            ? `/${t.dossier_sectie}/${t.dossier_id}/taken`
            : null;
          const dossierNaam = t.dossier_naam ?? t.lijst?.naam ?? '—';
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '6px 2px',
              borderBottom: i < displayed.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <button onClick={() => toggle(t.id)} style={{
                width: 18, height: 18, borderRadius: 5,
                border: `1.5px solid ${done ? 'var(--accent)' : 'var(--border)'}`,
                background: done ? 'var(--accent)' : 'transparent',
                cursor: 'pointer', flexShrink: 0,
                display: 'grid', placeItems: 'center', color: 'white',
              }}>
                {done && <IconCheck size={11}/>}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{
                    flex: 1, minWidth: 0,
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                    color: done ? 'var(--fg-muted)' : 'var(--fg)',
                    textDecoration: done ? 'line-through' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.titel}</div>
                  <span style={{
                    fontFamily: 'var(--font-ui)', fontSize: 10, color: due === 'Verlopen' ? '#d04a2a' : 'var(--fg-muted)',
                    fontWeight: due === 'Verlopen' ? 600 : 400, flexShrink: 0,
                  }}>{due}</span>
                </div>
                {/* Dossiernaam onder de taaknaam */}
                {dossierHref ? (
                  <a
                    href={dossierHref}
                    style={{
                      display: 'block', marginTop: 1,
                      fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                      color: 'var(--accent)', letterSpacing: '0.02em',
                      textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >{dossierNaam}</a>
                ) : (
                  <span style={{
                    display: 'block', marginTop: 1,
                    fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                    color: 'var(--fg-muted)', letterSpacing: '0.04em',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{dossierNaam}</span>
                )}
              </div>
              <PriDot p={pri}/>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}

/* ── RemindersWidget ─────────────────────────────────────── */
export function RemindersWidget({ taken }: { taken: TaakMetDetails[] }) {
  const router = useRouter();
  const today = localDateStr();
  // Urgente taken + taken die binnen 3 werkdagen (excl. weekend/feestdagen) verlopen.
  // Input is al gesorteerd op deadline ASC (nulls laatst).
  const drempel = React.useMemo(() => berekenWerkdagenDrempel(new Date(), 3), []);
  const urgent = taken
    .filter(t => t.prioriteit === 'urgent' || (t.deadline && t.deadline <= drempel))
    .slice(0, MAX_HERINNERINGEN);

  return (
    <WidgetShell
      title="Mijn herinneringen"
      subtitle={urgent.length > 0 ? `${urgent.length} dringend` : 'Niets dringends'}
      Icon={IconBell}
      onMore={() => router.push('/taken')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
        {urgent.length === 0 && (
          <div style={{ padding: '8px 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
            Geen urgente taken.
          </div>
        )}
        {urgent.map((t) => {
          const overdue = t.deadline && t.deadline < today;
          const accentColor = t.prioriteit === 'urgent' || overdue ? '#d04a2a' : 'var(--accent)';
          return (
            <div key={t.id} style={{
              display: 'flex', gap: 12, padding: '10px 12px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
            }}>
              <div style={{ width: 4, alignSelf: 'stretch', background: accentColor, borderRadius: 2, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.titel}
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: overdue ? '#d04a2a' : 'var(--fg-muted)', marginTop: 2, fontWeight: 500 }}>
                  {relativeDeadline(t.deadline)} · {t.lijst?.naam ?? t.dossier_naam ?? 'Takenlijst'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}

/* ── DossierLijstWidget (gedeeld: opdrachten + aanvragen) ── */
function DossierLijstWidget({ title, dossiers, sectie, Icon, dotKleur, moreHref, emptyText, countLabel, subKleur, labelFn }: {
  title: string;
  dossiers: DossierRij[];
  sectie: 'aanvragen' | 'opdrachten' | 'servicedesk';
  Icon: React.FC<{ size?: number }>;
  dotKleur: string;
  moreHref: string;
  emptyText: string;
  countLabel: string;
  /** Optionele kleur per dossier voor het substatus-label (bijv. rood bij actie vereist). */
  subKleur?: (d: DossierRij) => string;
  /** Bepaalt het substatus-label per dossier (standaard op basis van hoofdstatus-fase). */
  labelFn?: (d: DossierRij) => string;
}) {
  const router = useRouter();
  const displayed = dossiers.slice(0, MAX_DOSSIERS);
  const toonLabel = labelFn ?? substatusLabel;

  return (
    <WidgetShell
      title={title}
      subtitle={displayed.length > 0 ? `${displayed.length} ${countLabel}` : 'Geen actieve dossiers'}
      Icon={Icon}
      onMore={() => router.push(moreHref)}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayed.length === 0 && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0' }}>
            {emptyText}
          </div>
        )}
        {displayed.map((d, i) => {
          const sub = toonLabel(d);
          return (
            <a
              key={d.id}
              href={`/${sectie}/${d.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 2px',
                borderBottom: i < displayed.length - 1 ? '1px solid var(--border)' : 'none',
                textDecoration: 'none', color: 'inherit',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotKleur, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.titel}
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.klant_naam ?? '—'}
                </div>
              </div>
              <span style={{
                flexShrink: 0,
                fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                color: subKleur?.(d) ?? dotKleur,
              }}>{sub}</span>
            </a>
          );
        })}
      </div>
    </WidgetShell>
  );
}

/* ── ProjectsWidget ──────────────────────────────────────── */
export function ProjectsWidget({ opdrachten }: { opdrachten: DossierRij[] }) {
  return (
    <DossierLijstWidget
      title="Mijn opdrachten"
      dossiers={opdrachten}
      sectie="opdrachten"
      Icon={IconOpdrachten}
      dotKleur="var(--accent)"
      moreHref="/opdrachten"
      emptyText="Geen opdrachten gevonden."
      countLabel="lopend"
      subKleur={d => (d.opdracht_substatus === 'uitvoering_gereed' || d.opdracht_substatus === 'financieel_gereed')
        ? '#d04a2a'
        : 'var(--accent)'}
    />
  );
}

/* ── DossierWidget ───────────────────────────────────────── */
export function DossierWidget({ aanvragen }: { aanvragen: DossierRij[] }) {
  return (
    <DossierLijstWidget
      title="Mijn aanvragen"
      dossiers={aanvragen}
      sectie="aanvragen"
      Icon={IconAanvragen}
      dotKleur="#d9a036"
      moreHref="/aanvragen"
      emptyText="Geen lopende aanvragen."
      countLabel="actief"
    />
  );
}

/* ── ServicedeskWidget ───────────────────────────────────── */
export function ServicedeskWidget({ dossiers }: { dossiers: DossierRij[] }) {
  return (
    <DossierLijstWidget
      title="Mijn Servicedesk"
      dossiers={dossiers}
      sectie="servicedesk"
      Icon={IconServicedesk}
      dotKleur="#3a7fb8"
      moreHref="/servicedesk"
      emptyText="Geen servicedesk-dossiers."
      countLabel="lopend"
      labelFn={servicedeskSubstatusLabel}
    />
  );
}

/* ── NewsWidget ──────────────────────────────────────────── */
interface NewsItem { source: string; title: string; link: string; pubDate: string; tag: string }

export function NewsWidget() {
  const [items, setItems] = React.useState<NewsItem[] | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/nieuws')
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .catch(() => setError(true));
  }, []);

  const loading = items === null && !error;
  const displayed = items?.slice(0, MAX_NIEUWS);

  return (
    <WidgetShell title="Nieuws uit de sector" subtitle="NU.nl Economie · Installatie.nl · NU.nl Wonen" action="Kanalen" Icon={IconSparkle}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading && [0,1,2,3].map(i => (
          <div key={i} style={{ padding: '10px 2px', borderBottom: i < MAX_NIEUWS - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 7, background: 'var(--bg-active)', flexShrink: 0 }}/>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              <div style={{ height: 12, borderRadius: 4, background: 'var(--bg-active)', width: '80%' }}/>
              <div style={{ height: 10, borderRadius: 4, background: 'var(--bg-active)', width: '40%' }}/>
            </div>
          </div>
        ))}
        {error && (
          <div style={{ padding: '12px 2px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
            Nieuws niet beschikbaar.
          </div>
        )}
        {displayed?.map((n, i) => (
          <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', gap: 12, padding: '10px 2px',
            borderBottom: i < displayed.length - 1 ? '1px solid var(--border)' : 'none',
            textDecoration: 'none', color: 'inherit',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 7, flexShrink: 0,
              background: `linear-gradient(135deg, oklch(0.6 0.08 ${140 + i * 30}), oklch(0.4 0.10 ${120 + i * 30}))`,
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-ui)', fontSize: 8, fontWeight: 700,
              color: 'white', textAlign: 'center', letterSpacing: '0.03em', textTransform: 'uppercase',
              lineHeight: 1.2, padding: 4,
            }}>{n.source}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{n.title}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)', marginTop: 3, letterSpacing: '0.04em' }}>
                {n.source} · {relativeNewsTime(n.pubDate)} · <span style={{ color: 'var(--accent)' }}>{n.tag}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </WidgetShell>
  );
}

/* ── WeatherWidget ───────────────────────────────────────── */
interface WeatherData {
  stad: string;
  temp: number; feelsLike: number; windspeed: number;
  weathercode: number; emoji: string; label: string;
  tempMax: number; tempMin: number;
  hourly?: { time: string; uur: string; temp: number; emoji: string }[];
  daily: { day: string; tempMax: number; tempMin: number; emoji: string; weathercode: number }[];
}

export function WeatherWidget() {
  const [data, setData] = React.useState<WeatherData | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/weather')
      .then(r => r.json())
      .then(d => d.error ? setError(true) : setData(d))
      .catch(() => setError(true));
  }, []);

  return (
    <WidgetShell title={`Weer · ${data?.stad ?? '…'}`} subtitle={data?.label ?? (error ? 'Niet beschikbaar' : 'Laden…')} Icon={IconSun} compact>
      <div style={{
        marginTop: 4, padding: '16px 18px', borderRadius: 12,
        background: 'linear-gradient(135deg, #3a7fb8, #2a5a85)',
        color: 'white', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 48, lineHeight: 1 }}>{data?.emoji ?? '⛅'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {data ? `${data.temp}°` : '—'}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, opacity: 0.85, marginTop: 4 }}>
            {data ? `Voelt als ${data.feelsLike}° · wind ${data.windspeed} km/u` : (error ? 'Weersdata niet beschikbaar' : 'Laden…')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, opacity: 0.85 }}>Max {data?.tempMax ?? '—'}°</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, opacity: 0.85 }}>Min {data?.tempMin ?? '—'}°</div>
        </div>
      </div>
      {/* Uurverwachting — komende 6 uren */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 4,
        marginTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)',
      }}>
        {(() => {
          const nu = new Date();
          const uren = (data?.hourly ?? []).filter(h => new Date(h.time) >= nu).slice(0, 6);
          const cellen = uren.length > 0
            ? uren
            : Array.from({ length: 6 }, () => ({ uur: '—', emoji: '⛅', temp: null as number | null }));
          return cellen.map((h, i) => (
            <div key={i} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)' }}>{h.uur}</div>
              <div style={{ fontSize: 15, margin: '3px 0' }}>{h.emoji}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>
                {h.temp !== null ? `${h.temp}°` : '—'}
              </div>
            </div>
          ));
        })()}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 4 }}>
        {(data?.daily ?? Array.from({ length: 7 }, (_, i) => ({
          day: i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : '—',
          tempMax: null, tempMin: null, emoji: '⛅',
        }))).map((d, i) => (
          <div key={i} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: i === 0 ? 'var(--accent)' : 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.day}</div>
            <div style={{ fontSize: 16, margin: '4px 0' }}>{d.emoji}</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>
              {(d as any).tempMax !== null ? `${(d as any).tempMax}°` : '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg-muted)' }}>
              {(d as any).tempMin !== null ? `${(d as any).tempMin}°` : ''}
            </div>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}

/* ── AgendaWidget ────────────────────────────────────────── */

export type AgendaWidgetItem = {
  id:          string
  titel:       string
  start_datum: string
  type:        string
  kleur:       string
}

const TYPE_LABELS: Record<string, string> = {
  feestdag:    'Feestdag',
  verjaardag:  'Verjaardag',
  jubileum:    'Jubileum',
  vca_toolbox: 'VCA Toolbox',
  audit:       'Audit',
  teamoverleg: 'Teamoverleg',
  activiteit:  'Activiteit',
  herinnering: 'Herinnering',
  atv_dag:     'ATV-dag',
  overig:      'Overig',
}

function datumLabel(start: string): string {
  const today = new Date()
  const yyyy  = today.getFullYear()
  const mm    = String(today.getMonth() + 1).padStart(2, '0')
  const dd    = String(today.getDate()).padStart(2, '0')
  const vandaagStr = `${yyyy}-${mm}-${dd}`

  if (start === vandaagStr) return 'Vandaag'

  const d        = new Date(start + 'T00:00:00')
  const todayMid = new Date(vandaagStr + 'T00:00:00')
  const diff     = Math.round((d.getTime() - todayMid.getTime()) / 86400000)

  if (diff === 1) return 'Morgen'

  const dagNames  = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  const maandNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

  if (diff <= 7) return `${dagNames[d.getDay()]} ${d.getDate()} ${maandNames[d.getMonth()]}`
  return `${d.getDate()} ${maandNames[d.getMonth()]}`
}

export function AgendaWidget({ items = [] }: { items?: AgendaWidgetItem[] }) {
  const router = useRouter()

  const subtitle = items.length === 0
    ? 'Niets gepland'
    : items.length === 1
      ? '1 aankomend item'
      : `${items.length} aankomende items`

  return (
    <WidgetShell
      title="Bedrijfsagenda"
      subtitle={subtitle}
      action="Alle"
      onAction={() => router.push('/planning/bedrijfsagenda')}
      Icon={IconAgenda}
      compact
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
        {items.length === 0 && (
          <div style={{ padding: '8px 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
            Geen aankomende items.
          </div>
        )}
        {items.map(item => {
          const label     = datumLabel(item.start_datum)
          const isVandaag = label === 'Vandaag'
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color:         isVandaag ? 'var(--accent)' : 'var(--fg-muted)',
                minWidth:      60, flexShrink: 0, letterSpacing: '-0.01em',
              }}>{label}</div>
              <div style={{ width: 3, alignSelf: 'stretch', background: item.kleur, borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                  color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{item.titel}</div>
                <div style={{
                  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                  color: 'var(--fg-muted)', marginTop: 1,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>{TYPE_LABELS[item.type] ?? item.type}</div>
              </div>
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
}

/* ── AddWidgetTile ───────────────────────────────────────── */
export function AddWidgetTile() {
  const options = ['Offertes', 'Facturen status', 'Team-activiteit', 'Urenregistratie', 'Social feed', 'Verkeer & reistijd'];
  return (
    <section style={{
      border: '1.5px dashed var(--border)',
      borderRadius: 14, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
      background: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'var(--bg-active)', display: 'grid', placeItems: 'center', color: 'var(--accent)',
        }}>
          <IconPlus size={15}/>
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Widget toevoegen</div>
      </div>
      <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
        Sleep nieuwe blokken naar je overzicht. Kies uit onderstaande of koppel een nieuwe bron.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o, i) => (
          <button key={i} style={{
            padding: '5px 10px',
            background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 999,
            color: 'var(--fg-soft)',
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500,
            cursor: 'pointer',
          }}>+ {o}</button>
        ))}
      </div>
    </section>
  );
}
