'use client';
import React from 'react';
import { IconCheck } from '../Icons';

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{label}</div>
        {help && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{help}</div>}
      </div>
      {children}
    </div>
  );
}

function ModelCard({ name, tagline, meta, selected }: { name: string; tagline: string; meta: string; selected: boolean }) {
  return (
    <button style={{
      textAlign: 'left', padding: 14,
      background: selected ? 'var(--bg-active)' : 'var(--bg-elev)',
      border: `1px solid ${selected ? 'var(--fg)' : 'var(--border)'}`,
      borderRadius: 10, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.01em' }}>{name}</span>
        {selected && (
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--fg)', color: 'var(--bg)', display: 'grid', placeItems: 'center' }}>
            <IconCheck size={10}/>
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>{tagline}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.05em' }}>{meta}</div>
    </button>
  );
}

function SegControl({ options, value: initial }: { options: string[]; value: string }) {
  const [v, setV] = React.useState(initial);
  return (
    <div style={{ display: 'inline-flex', padding: 3, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }}>
      {options.map(o => (
        <button key={o} onClick={() => setV(o)} style={{
          padding: '7px 16px',
          background: v === o ? 'var(--bg)' : 'transparent',
          border: 'none', borderRadius: 6,
          color: v === o ? 'var(--fg)' : 'var(--fg-muted)',
          fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: v === o ? 500 : 400,
          cursor: 'pointer',
          boxShadow: v === o ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{o}</button>
      ))}
    </div>
  );
}

function Toggle({ label, help, on: initial }: { label: string; help?: string; on?: boolean }) {
  const [on, setOn] = React.useState(!!initial);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{label}</div>
        {help && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{help}</div>}
      </div>
      <button onClick={() => setOn(!on)} style={{
        width: 34, height: 20, borderRadius: 10,
        background: on ? 'var(--fg)' : 'var(--border)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.15s', flexShrink: 0, marginTop: 2,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 16 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: 'var(--bg)', transition: 'left 0.15s',
        }}/>
      </button>
    </div>
  );
}

const SECTIONS = [
  { key: 'account',     label: 'Account'     },
  { key: 'workspace',   label: 'Workspace'   },
  { key: 'ai',          label: 'AI model'    },
  { key: 'connections', label: 'Connections' },
  { key: 'billing',     label: 'Billing'     },
  { key: 'security',    label: 'Security'    },
];

export default function SettingsView() {
  const [active, setActive] = React.useState('ai');

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '220px 1fr',
      maxWidth: 1000, margin: '0 auto', width: '100%',
      padding: '32px 40px 40px', gap: 40,
    }}>
      {/* Sidebar nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 10px 10px' }}>Settings</div>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActive(s.key)} style={{
            padding: '8px 10px',
            background: active === s.key ? 'var(--bg-active)' : 'transparent',
            border: 'none', borderRadius: 6,
            color: active === s.key ? 'var(--fg)' : 'var(--fg-muted)',
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: active === s.key ? 500 : 400,
            cursor: 'pointer', textAlign: 'left',
          }}>{s.label}</button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg)' }}>AI model</h2>
          <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', maxWidth: 500, lineHeight: 1.5 }}>
            Kies hoe EVA redeneert. Snellere modellen zijn goedkoper; diepere modellen zijn beter voor complexe taken.
          </p>
        </div>

        <Field label="Standaard model">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <ModelCard name="EVA Swift" tagline="Snelle antwoorden, lage kosten" meta="200 tok/s" selected={false}/>
            <ModelCard name="EVA Pro"   tagline="Gebalanceerd – dagelijks gebruik" meta="80 tok/s" selected={true}/>
            <ModelCard name="EVA Deep"  tagline="Complexe redenering"            meta="30 tok/s · €" selected={false}/>
          </div>
        </Field>

        <Field label="Antwoordstijl" help="Hoe EVA standaard antwoorden schrijft.">
          <SegControl options={['Beknopt', 'Gebalanceerd', 'Uitgebreid']} value="Gebalanceerd"/>
        </Field>

        <Field label="Toon" help="Past de stem aan in alle antwoorden.">
          <SegControl options={['Formeel', 'Neutraal', 'Warm']} value="Neutraal"/>
        </Field>

        <Toggle label="Gebruik mijn bibliotheek als context" help="EVA haalt op uit documenten die je hebt toegevoegd." on/>
        <Toggle label="Bronnen inline citeren" help="Toon citaten na beweringen in antwoorden." on/>
        <Toggle label="Gesprekken opslaan" help="Houdt een doorzoekbare geschiedenis bij." on/>
        <Toggle label="Trainen op mijn data" help="Help EVA verbeteren. Standaard uit voor Pro."/>

        <Field label="Aangepaste instructies" help="Aanhoudende context voor elk gesprek.">
          <textarea
            defaultValue="Ik run projectadministratie bij Everts. Geef de voorkeur aan concrete voorbeelden boven abstracte adviezen. Geef altijd aannames aan."
            rows={3}
            style={{
              width: '100%', padding: '12px 14px',
              background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13, lineHeight: 1.5,
              resize: 'vertical', outline: 'none',
            }}
          />
        </Field>
      </div>
    </div>
  );
}
