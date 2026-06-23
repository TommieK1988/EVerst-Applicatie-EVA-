'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconArrowRight } from '../Icons';
import { EvaSearchField } from '../GlobalSearch';
import {
  TasksWidget, WeatherWidget,
  ProjectsWidget, AgendaWidget, DossierWidget, NewsWidget, ServicedeskWidget,
} from '../widgets';
import type { AgendaWidgetItem } from '../widgets';
import type { TaakMetDetails } from '@/lib/taken/supabase/database.types';
import type { DossierRij } from '@/components/dossiers/types';

const HERO_BG = 'url(/polygon-bg.png)';

const QUOTES = [
  'Kwaliteit is geen toeval — het is het resultaat van aandacht.',
  'Elke dag is een nieuwe kans om te bouwen aan iets groots.',
  'Vertrouwen bouw je met elke handdruk en elke oplevering.',
  'Het mooiste werk zie je wanneer het klaar is.',
  'Samen staan we sterker dan elk fundament.',
  'Goed vakmanschap spreekt voor zichzelf.',
  'Een goed plan vandaag is het halve werk morgen.',
  'Wat je met zorg bouwt, blijft staan.',
  'Elke uitdaging is een kans om te laten zien wat je waard bent.',
  'Kleine verbeteringen iedere dag leiden tot grote resultaten.',
  'De klant onthoudt niet hoe snel het ging, maar hoe goed het was.',
  'Precisie maakt het verschil tussen goed en uitmuntend.',
  'Een tevreden klant is de beste aanbeveling.',
  'Vakmanschap is een kunst die je elke dag opnieuw bewijst.',
  'Het begint met een plan, maar eindigt met trots.',
  'Wij bouwen niet alleen gebouwen — we bouwen aan vertrouwen.',
  'Elke steen op zijn plaats legt de basis voor succes.',
  'Doorzetten is de sleutel tot elk afgerond project.',
  'Perfectionisme is geen zwakte, het is ons handmerk.',
  'Een goed resultaat begint bij een goede voorbereiding.',
  'De beste investering is die in kwaliteit.',
  'Stap voor stap bereiken we wat ons voor ogen staat.',
  'Fouten zijn kansen om het de volgende keer beter te doen.',
  'Samenwerken maakt zwaar werk licht.',
  'Wie de details verzorgt, bouwt iets dat generaties meegaat.',
  'Elke oplevering is een belofte die we waarmaken.',
  'In ons werk zit ons hart.',
  'Trots op wat we maken, elke dag opnieuw.',
  'Doen wat je belooft — dat is het fundament van alles.',
  'Werken met passie is de kortste weg naar kwaliteit.',
];

function getDailyQuote(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return QUOTES[dayOfYear % QUOTES.length];
}

function formatDate() {
  return new Date()
    .toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^\w/, c => c.toUpperCase());
}

function getWeekNumber(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/* ── Widget config ────────────────────────────────────────── */

type WidgetId = 'tasks' | 'weather' | 'projects' | 'agenda' | 'dossier' | 'servicedesk' | 'news' | 'summary';

const DEFAULT_SPANS: Record<WidgetId, number> = {
  tasks: 5, weather: 4,
  projects: 4, dossier: 4, servicedesk: 4,
  agenda: 4, news: 4, summary: 4,
};

const DEFAULT_ORDER: WidgetId[] = [
  'tasks', 'weather',
  'projects', 'dossier', 'servicedesk',
  'agenda', 'news', 'summary',
];

const MIN_COLS = 3; // 3/12 = 25% ≥ 20% minimum

/* ── SortableWidget ───────────────────────────────────────── */

function SortableWidget({
  id, span, editing, onResizeStart, children,
}: {
  id: WidgetId;
  span: number;
  editing: boolean;
  onResizeStart: (e: React.MouseEvent, id: WidgetId, currentSpan: number) => void;
  children: React.ReactNode;
}) {
  const [resizeHover, setResizeHover] = React.useState(false);

  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id, disabled: !editing });

  const pct = Math.round((span / 12) * 100);

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `span ${span}`,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        outline: editing ? '2px dashed rgba(0,0,0,0.12)' : 'none',
        outlineOffset: -2,
        borderRadius: 14,
      }}
    >
      {/* Drag handle + width badge */}
      {editing && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            title="Versleep widget"
            style={{
              width: 26, height: 26,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 7,
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              cursor: 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none',
              color: 'rgba(0,0,0,0.4)',
              fontSize: 14,
            }}
          >
            ⠿
          </div>
          <div style={{
            background: 'var(--accent)',
            color: 'white',
            fontFamily: 'var(--font-ui)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            padding: '2px 5px',
            borderRadius: 4,
          }}>
            {pct}%
          </div>
        </div>
      )}

      {/* Resize handle – right edge */}
      {editing && (
        <div
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart(e, id, span); }}
          onMouseEnter={() => setResizeHover(true)}
          onMouseLeave={() => setResizeHover(false)}
          style={{
            position: 'absolute',
            right: 0,
            top: '12%',
            bottom: '12%',
            width: 12,
            cursor: 'col-resize',
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            width: 4,
            height: '100%',
            borderRadius: 2,
            background: resizeHover ? 'var(--accent)' : 'rgba(0,0,0,0.15)',
            transition: 'background 0.15s',
          }}>
            {/* grip dots */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 3, height: 3, borderRadius: '50%',
                  background: resizeHover ? 'white' : 'rgba(255,255,255,0.7)',
                }}/>
              ))}
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

/* ── SummaryCard ──────────────────────────────────────────── */

function SummaryCard({ opdrachten, aanvragen, offertes, taken, vandaagStr, onEva }: {
  opdrachten: DossierRij[];
  aanvragen: DossierRij[];
  offertes: DossierRij[];
  taken: TaakMetDetails[];
  vandaagStr: string;
  onEva: () => void;
}) {
  return (
    <section style={{
      borderRadius: 14, padding: 20, color: 'white',
      height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      backgroundImage: HERO_BG,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)',
        }}>
          Week {getWeekNumber()} · In één oogopslag
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
          {[
            { v: String(opdrachten.length), l: 'Mijn opdrachten' },
            { v: String(aanvragen.length),  l: 'Open aanvragen'  },
            { v: String(offertes.length),   l: 'Open offertes'   },
            { v: String(taken.filter(t => t.deadline && t.deadline <= vandaagStr).length), l: 'Taken vandaag' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
                letterSpacing: '-0.02em', lineHeight: 1,
              }}>{s.v}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3, fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onEva}
        style={{
          marginTop: 16, padding: '10px 14px',
          background: 'white', color: 'var(--brand-deep)',
          border: 'none', borderRadius: 8,
          fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        Vraag EVA om weeksamenvatting
        <IconArrowRight size={14}/>
      </button>
    </section>
  );
}

/* ── HomeView ─────────────────────────────────────────────── */

export interface HomeViewProps {
  displayName: string;
  taken: TaakMetDetails[];
  aanvragen: DossierRij[];
  offertes: DossierRij[];
  opdrachten: DossierRij[];
  servicedesk: DossierRij[];
  agendaItems: AgendaWidgetItem[];
}

export default function HomeView({
  displayName, taken, aanvragen, offertes, opdrachten, servicedesk, agendaItems,
}: HomeViewProps) {
  const router = useRouter();
  const [greeting, setGreeting] = React.useState('Goedemorgen');
  const [editing, setEditing] = React.useState(false);
  const [widgetOrder, setWidgetOrder] = React.useState<WidgetId[]>(DEFAULT_ORDER);
  const [widgetSpans, setWidgetSpans] = React.useState<Record<WidgetId, number>>({ ...DEFAULT_SPANS });

  const gridRef = React.useRef<HTMLDivElement>(null);
  const resizeRef = React.useRef<{ id: WidgetId; startX: number; startSpan: number } | null>(null);

  React.useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond');
  }, []);

  React.useEffect(() => {
    try {
      const savedOrder = localStorage.getItem('eva-widget-order');
      if (savedOrder) {
        const parsed: WidgetId[] = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          // Filter verwijderde/onbekende widgets eruit (bv. 'reminders') en
          // voeg nieuwe widgets toe die nog niet in een opgeslagen layout zaten.
          const geldig = parsed.filter(id => DEFAULT_SPANS[id] !== undefined);
          const merged = [...geldig, ...DEFAULT_ORDER.filter(id => !geldig.includes(id))];
          setWidgetOrder(merged);
        }
      }
      const savedSpans = localStorage.getItem('eva-widget-spans');
      if (savedSpans) {
        const parsed = JSON.parse(savedSpans) as Partial<Record<WidgetId, number>>;
        setWidgetSpans(prev => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgetOrder(order => {
        const newOrder = arrayMove(
          order,
          order.indexOf(active.id as WidgetId),
          order.indexOf(over.id as WidgetId),
        );
        try { localStorage.setItem('eva-widget-order', JSON.stringify(newOrder)); } catch {}
        return newOrder;
      });
    }
  }

  function onResizeStart(e: React.MouseEvent, id: WidgetId, currentSpan: number) {
    resizeRef.current = { id, startX: e.clientX, startSpan: currentSpan };

    const handleMove = (evt: MouseEvent) => {
      const resize = resizeRef.current;
      if (!resize || !gridRef.current) return;
      const colWidth = gridRef.current.offsetWidth / 12;
      const deltaCols = Math.round((evt.clientX - resize.startX) / colWidth);
      const newSpan = Math.max(MIN_COLS, Math.min(12, resize.startSpan + deltaCols));
      setWidgetSpans(prev => prev[resize.id] === newSpan ? prev : { ...prev, [resize.id]: newSpan });
    };

    const handleUp = () => {
      resizeRef.current = null;
      setWidgetSpans(prev => {
        try { localStorage.setItem('eva-widget-spans', JSON.stringify(prev)); } catch {}
        return prev;
      });
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }

  const go = (seed: string) => {
    router.push(seed ? `/vraag-eva?seed=${encodeURIComponent(seed)}` : '/vraag-eva');
  };

  const vandaagStr = new Date().toISOString().split('T')[0];
  const openActies = taken.filter(t => t.deadline && t.deadline <= vandaagStr).length;
  const actiesText = openActies === 1
    ? '1 actie wacht vandaag op jou.'
    : openActies > 1
      ? `${openActies} acties wachten vandaag op jou.`
      : 'Je bent vandaag bij.';

  const quote = getDailyQuote();

  function renderWidget(id: WidgetId): React.ReactNode {
    switch (id) {
      case 'tasks':    return <TasksWidget taken={taken}/>;
      case 'weather':  return <WeatherWidget/>;
      case 'projects': return <ProjectsWidget opdrachten={opdrachten}/>;
      case 'agenda':   return <AgendaWidget items={agendaItems}/>;
      case 'dossier':  return <DossierWidget aanvragen={aanvragen}/>;
      case 'servicedesk': return <ServicedeskWidget dossiers={servicedesk}/>;
      case 'news':     return <NewsWidget/>;
      case 'summary':  return (
        <SummaryCard
          opdrachten={opdrachten}
          aanvragen={aanvragen}
          offertes={offertes}
          taken={taken}
          vandaagStr={vandaagStr}
          onEva={() => go('Geef een weeksamenvatting op basis van alle bronnen')}
        />
      );
    }
  }

  return (
    <div style={{ padding: '28px 36px 40px', width: '100%' }}>
      {/* Hero */}
      <div style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        padding: '32px 36px',
        backgroundImage: HERO_BG,
        backgroundSize: 'cover', backgroundPosition: 'center',
        marginBottom: 22, minHeight: 160,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        boxShadow: '0 12px 40px rgba(15,90,38,0.15)',
      }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
          color: 'rgba(255,255,255,0.75)', letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{formatDate()}</div>

        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22,
            letterSpacing: '0.06em', color: 'white', marginBottom: 12,
            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}>EVERTS.</div>
          <h1 style={{
            margin: 0, fontFamily: 'var(--font-display)',
            fontSize: 30, fontWeight: 700,
            letterSpacing: '-0.02em', lineHeight: 1.1, color: 'white',
          }}>{greeting}, {displayName}.</h1>
          <p style={{
            margin: '6px 0 0', fontFamily: 'var(--font-ui)', fontSize: 14,
            color: 'rgba(255,255,255,0.85)', maxWidth: 560,
          }}>{actiesText}</p>
          <p style={{
            margin: '8px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13,
            color: 'rgba(255,255,255,0.65)', fontStyle: 'italic', maxWidth: 560,
          }}>"{quote}"</p>
        </div>

        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          {editing && (
            <span style={{
              fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
              color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em',
            }}>
              Sleep ⠿ om te verplaatsen · Sleep rechterrand om breedte aan te passen
            </span>
          )}
          <button onClick={() => setEditing(!editing)} style={{
            padding: '6px 12px',
            background: editing ? 'white' : 'rgba(255,255,255,0.15)',
            color: editing ? 'var(--brand)' : 'white',
            backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)',
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            borderRadius: 6, cursor: 'pointer',
          }}>{editing ? 'Klaar' : 'Dashboard aanpassen'}</button>
        </div>
      </div>

      {/* Zoekbalk — typ direct, resultaten verschijnen eronder (geen popup) */}
      <div style={{ marginBottom: 22 }}>
        <EvaSearchField placeholder="Stel EVA een vraag over projecten, facturen of documenten." barStyle={{ padding: '14px 18px' }} />
      </div>

      {/* Widget grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gridAutoRows: 'minmax(10px, auto)',
              gap: 14,
            }}
          >
            {widgetOrder.map(id => (
              <SortableWidget
                key={id}
                id={id}
                span={widgetSpans[id]}
                editing={editing}
                onResizeStart={onResizeStart}
              >
                {renderWidget(id)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
