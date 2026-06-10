'use client';
import React from 'react';
import { Tweaks } from './types';
import { IconClose } from './Icons';

const THEMES: { key: Tweaks['theme']; label: string }[] = [
  { key: 'light', label: 'Licht'  },
  { key: 'dark',  label: 'Donker' },
];

const DENSITIES: { k: Tweaks['density']; l: string }[] = [
  { k: 'default', l: 'Standaard' },
  { k: 'dense',   l: 'Compact'   },
];

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--fg-soft)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function MiniSeg<T extends string>({
  options, value, onChange,
}: {
  options: { k: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7 }}>
      {options.map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{
          flex: 1, padding: '5px 8px',
          background: value === o.k ? 'var(--bg-active)' : 'transparent',
          border: 'none', borderRadius: 5,
          color: value === o.k ? 'var(--brand-700)' : 'var(--fg-muted)',
          fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: value === o.k ? 600 : 400,
          cursor: 'pointer',
        }}>{o.l}</button>
      ))}
    </div>
  );
}

type TweaksPanelProps = {
  tweaks: Tweaks;
  setTweaks: (t: Tweaks) => void;
  onClose: () => void;
};

export default function TweaksPanel({ tweaks, setTweaks, onClose }: TweaksPanelProps) {
  const update = (patch: Partial<Tweaks>) => setTweaks({ ...tweaks, ...patch });

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, width: 240,
      background: 'var(--bg-elev)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
      zIndex: 100, fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Weergave</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <IconClose size={14}/>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TweakRow label="Thema">
          <MiniSeg
            options={THEMES.map(t => ({ k: t.key, l: t.label }))}
            value={tweaks.theme}
            onChange={v => update({ theme: v })}
          />
        </TweakRow>

        <TweakRow label="Dichtheid">
          <MiniSeg
            options={DENSITIES}
            value={tweaks.density}
            onChange={v => update({ density: v })}
          />
        </TweakRow>
      </div>
    </div>
  );
}
