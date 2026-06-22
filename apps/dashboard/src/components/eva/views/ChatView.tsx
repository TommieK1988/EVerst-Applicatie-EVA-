'use client';
import React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { IconAttach, IconFolder, IconBolt, IconMic, IconArrowUp } from '../Icons';

/* tiny markdown → HTML (bold + italic + newline) */
function mdLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:var(--fg)">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em style="font-style:italic">$2</em>')
    .replace(/\n/g, '<br/>');
}

type MsgCard = { label: string; value: string };
type Message = { role: 'user' | 'assistant'; text: string; cards?: MsgCard[] };

function MsgAction({ label }: { label: string }) {
  return (
    <button style={{
      background: 'none', border: 'none',
      color: 'var(--fg-muted)',
      fontFamily: 'var(--font-ui)', fontSize: 12,
      cursor: 'pointer', padding: 0,
    }}>{label}</button>
  );
}

function MessageBubble({ role, text, cards }: Message) {
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '24px 0' }}>
        <div style={{
          maxWidth: '78%',
          background: 'var(--bg-active)', color: 'var(--fg)',
          padding: '12px 16px',
          borderRadius: '14px 14px 4px 14px',
          fontFamily: 'var(--font-ui)', fontSize: 15, lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>{text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 14, margin: '24px 0' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--accent)', color: 'white',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.04em', flexShrink: 0,
      }}>EVA</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 15, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: mdLite(text) }}
        />
        {cards && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {cards.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'var(--bg-elev)',
                fontSize: 11,
              }}>
                <span style={{ color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</span>
                <span style={{ color: 'var(--fg)' }}>{c.value}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
          <MsgAction label="Kopieer"/>
          <MsgAction label="Opnieuw genereren"/>
          <MsgAction label="Bewaar in bibliotheek"/>
        </div>
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div style={{ display: 'flex', gap: 14, margin: '24px 0' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--accent)', color: 'white',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.04em',
      }}>EVA</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 28 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--fg-muted)',
            animation: `evaTyping 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}/>
        ))}
      </div>
    </div>
  );
}

function ComposerChip({ Icon, label, active, model }: {
  Icon: React.FC<{ size?: number }>;
  label: string;
  active?: boolean;
  model?: boolean;
}) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: active ? 'var(--bg-active)' : 'transparent',
      border: '1px solid var(--border)', borderRadius: 999,
      color: model ? 'var(--accent)' : 'var(--fg-soft)',
      fontFamily: 'var(--font-ui)', fontSize: 12,
      cursor: 'pointer',
    }}>
      <Icon size={13}/>{label}
    </button>
  );
}

export default function ChatView() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const seed         = searchParams.get('seed') ?? ''

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const send = React.useCallback(async (vraag: string) => {
    const tekst = vraag.trim();
    if (!tekst || typing) return;
    setMessages(m => [...m, { role: 'user', text: tekst }]);
    setInput('');
    setTyping(true);
    try {
      const res = await fetch('/api/eva/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vraag: tekst }),
      });
      const data = await res.json().catch(() => ({}));
      const antwoord = res.ok
        ? (data.answer ?? 'Ik kon hier geen antwoord op formuleren.')
        : (data.error ?? 'Er ging iets mis bij het beantwoorden van de vraag.');
      setMessages(m => [...m, { role: 'assistant', text: antwoord }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'EVA is nu niet bereikbaar. Probeer het zo nog eens.' }]);
    } finally {
      setTyping(false);
    }
  }, [typing]);

  // Seed uit de URL (vanuit de snelzoeker of dashboard) → direct versturen.
  const seedVerwerkt = React.useRef(false);
  React.useEffect(() => {
    if (seed && !seedVerwerkt.current) {
      seedVerwerkt.current = true;
      router.replace('/vraag-eva');
      void send(seed);
    }
  }, [seed, router, send]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Thread */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 0 20px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', width: '100%', padding: '0 40px' }}>
          {messages.length === 0 && !typing && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
              }}>Vraag EVA</div>
              <h2 style={{
                margin: '0 0 8px',
                fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700,
                letterSpacing: '-0.02em', color: 'var(--fg)',
              }}>Wat wil je weten?</h2>
              <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1.6 }}>
                Stel een vraag over je relaties, dossiers en medewerkers — bijvoorbeeld
                <em> "Hoeveel staat er nog open bij …?"</em>. EVA zoekt uitsluitend in je eigen EVA-data.
              </p>
            </div>
          )}
          {messages.map((m, i) => <MessageBubble key={i} {...m}/>)}
          {typing && <Typing/>}
        </div>
      </div>

      {/* Composer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '16px 40px 22px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            padding: '12px 14px',
            background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14,
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Stel EVA een vraag…"
              rows={1}
              style={{
                background: 'transparent', border: 'none', color: 'var(--fg)',
                fontFamily: 'var(--font-ui)', fontSize: 15, lineHeight: 1.5,
                resize: 'none', outline: 'none', padding: '4px 4px', minHeight: 24,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ComposerChip Icon={IconAttach} label="Bijlage"/>
              <ComposerChip Icon={IconFolder} label="Alle bronnen" active/>
              <ComposerChip Icon={IconBolt}   label="EVA Pro" model/>
              <div style={{ flex: 1 }}/>
              <button style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'transparent', border: 'none', color: 'var(--fg-muted)',
                cursor: 'pointer', display: 'grid', placeItems: 'center',
              }}>
                <IconMic size={17}/>
              </button>
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || typing}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: input.trim() ? 'var(--fg)' : 'var(--bg-active)',
                  color:      input.trim() ? 'var(--bg)' : 'var(--fg-muted)',
                  border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                  display: 'grid', placeItems: 'center', transition: 'all 0.15s',
                }}
              >
                <IconArrowUp size={16}/>
              </button>
            </div>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', marginTop: 8,
            fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 500,
            color: 'var(--fg-muted)', letterSpacing: '0.02em',
          }}>
            EVA kan fouten maken · controleer belangrijke gegevens altijd in de bronsystemen
          </div>
        </div>
      </div>
    </div>
  );
}
