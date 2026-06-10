'use client';
import React from 'react';
import { IconPlus, IconSync, IconWarn, IconOffice, IconBuilding, IconFile, IconEuro } from '../Icons';

function StatBlock({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-elev)', padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', color: warn ? 'var(--accent-2)' : 'var(--fg)', marginTop: 6 }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

type Source = {
  key: string; name: string; category: string; status: string;
  last: string; records: string; desc: string; color: string;
  Icon: React.FC<{ size?: number }>; synced: string;
};

function SourceCard({ name, category, last, records, desc, color, Icon, synced }: Omit<Source, 'key'>) {
  const warn = synced === 'warn';
  return (
    <div style={{ padding: 18, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: color, color: 'white', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={19}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg)' }}>{name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 1 }}>{category}</div>
        </div>
        {warn ? (
          <span style={{ padding: '3px 8px', background: 'oklch(0.95 0.04 65)', color: '#856020', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, borderRadius: 4 }}>Aandacht nodig</span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#28a44a' }}/>Verbonden
          </span>
        )}
      </div>

      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)', lineHeight: 1.4 }}>{desc}</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>{records}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>Sync {last}</div>
      </div>

      {warn && (
        <div style={{ padding: '10px 12px', background: 'oklch(0.97 0.02 65)', border: '1px solid oklch(0.88 0.05 65)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconWarn size={14} style={{ color: '#d9a036', flexShrink: 0 }}/>
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: '#856020' }}>Sync-fout bij laatste poging</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#b07a30', marginTop: 2 }}>
              Token verlopen · 3 uur geleden ·{' '}
              <button style={{ background: 'none', border: 'none', color: '#009439', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Vernieuwen</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-active)', border: 'none', borderRadius: 7, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--fg)', cursor: 'pointer' }}>Instellingen</button>
        <button style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-active)', border: 'none', borderRadius: 7, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--fg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <IconSync size={13}/> Sync nu
        </button>
      </div>
    </div>
  );
}

const SOURCES: Source[] = [
  { key: 'o365',  name: 'Office 365',    category: 'Productiviteit',         status: 'verbonden',      last: '2 min geleden',  records: '12.840 items',              desc: 'E-mail, Teams, SharePoint en OneDrive',         color: 'oklch(0.55 0.14 250)', Icon: IconOffice,   synced: 'live' },
  { key: 'bouw7', name: 'Exact Bouw7',   category: 'Projectadministratie',   status: 'verbonden',      last: '14 min geleden', records: '342 projecten · 1.284 uren', desc: 'Projecten, urenregistratie en kostenbewaking',  color: 'oklch(0.58 0.15 40)',  Icon: IconBuilding, synced: '15m'  },
  { key: 'wv',    name: 'WhiteVision',   category: 'Documentherkenning',     status: 'verbonden',      last: '28 min geleden', records: '4.128 facturen dit jaar',    desc: 'Automatische factuurherkenning en boeking',     color: 'oklch(0.60 0.12 190)', Icon: IconFile,     synced: '30m'  },
  { key: 'eol',   name: 'Exact Online',  category: 'Financieel',             status: 'aandacht nodig', last: '3 uur geleden',  records: '8.642 boekingen YTD',        desc: 'Grootboek, debiteuren en crediteuren',          color: 'oklch(0.60 0.14 140)', Icon: IconEuro,     synced: 'warn' },
];

const AVAILABLE = [
  { name: 'Dropbox',    cat: 'Opslag' },
  { name: 'Nmbrs',      cat: 'HR & salaris' },
  { name: 'AFAS',       cat: 'ERP' },
  { name: 'Twinfield',  cat: 'Boekhouding' },
];

export default function SourcesView() {
  return (
    <div style={{ padding: '28px 40px 40px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Status bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
        <StatBlock label="Actieve bronnen"           value="4"      sub="van 4 geconfigureerd"/>
        <StatBlock label="Synchronisaties vandaag"   value="1.284"  sub="+18% t.o.v. gister"/>
        <StatBlock label="Geïndexeerde records"      value="25.950" sub="laatste refresh 2 min"/>
        <StatBlock label="Openstaande acties"        value="3"      sub="1 bron heeft aandacht nodig" warn/>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg)' }}>Verbonden bronnen</h2>
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>Alle systemen waar EVA gegevens uit haalt.</p>
        </div>
        <button style={{ padding: '8px 14px', background: 'var(--fg)', color: 'var(--bg)', border: 'none', borderRadius: 8, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconPlus size={14}/> Bron toevoegen
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 36 }}>
        {SOURCES.map(({ key, ...s }) => <SourceCard key={key} {...s}/>)}
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg)' }}>Beschikbare integraties</h3>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>Binnenkort toe te voegen op basis van jullie roadmap.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {AVAILABLE.map((a, i) => (
          <div key={i} style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 10, background: 'transparent', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{a.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{a.cat}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
