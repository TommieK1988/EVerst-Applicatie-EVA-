'use client';
import React from 'react';
import { IconPlus, IconPin, IconMore } from '../Icons';

function SmallBtn({ label }: { label: string }) {
  return (
    <button style={{ padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--fg-soft)', fontFamily: 'var(--font-ui)', fontSize: 12, cursor: 'pointer' }}>{label}</button>
  );
}

const TABS = [
  { key: 'all',     label: 'All',          count: 132 },
  { key: 'docs',    label: 'Documents',    count: 84  },
  { key: 'chats',   label: 'Saved chats',  count: 31  },
  { key: 'sources', label: 'Sources',      count: 17  },
];

const ITEMS = [
  { title: 'Pricing strategy - EU launch',       type: 'Doc',   source: 'Google Drive', tag: 'Strategy', pinned: true,  updated: '2h' },
  { title: 'Onboarding copy - v3',               type: 'Doc',   source: 'Notion',       tag: 'Writing',  pinned: false, updated: '1d' },
  { title: 'Customer interviews transcript',     type: 'Audio', source: 'Upload',       tag: 'Research', pinned: false, updated: '2d' },
  { title: 'Supplier terms - legal review',      type: 'PDF',   source: 'Upload',       tag: 'Legal',    pinned: false, updated: '3d' },
  { title: 'Q2 OKR breakdown',                   type: 'Doc',   source: 'Notion',       tag: 'Planning', pinned: false, updated: '3d' },
  { title: 'Competitive landscape - Q1',         type: 'Chat',  source: 'EVA',          tag: 'Research', pinned: true,  updated: '1w' },
  { title: 'Brand voice guide',                  type: 'Doc',   source: 'Google Drive', tag: 'Brand',    pinned: false, updated: '1w' },
  { title: 'Product launch retro',               type: 'Chat',  source: 'EVA',          tag: 'Ops',      pinned: false, updated: '2w' },
];

export default function LibraryView() {
  const [tab, setTab] = React.useState('all');

  return (
    <div style={{ padding: '28px 40px 40px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 14px',
            background: 'transparent', border: 'none',
            borderBottom: `2px solid ${tab === t.key ? 'var(--fg)' : 'transparent'}`,
            color: tab === t.key ? 'var(--fg)' : 'var(--fg-muted)',
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: tab === t.key ? 500 : 400,
            cursor: 'pointer', marginBottom: -1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{t.count}</span>
          </button>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
          <SmallBtn label="Sort: Recent"/>
          <SmallBtn label="Filter"/>
          <button style={{
            padding: '7px 12px', background: 'var(--fg)', color: 'var(--bg)',
            border: 'none', borderRadius: 7,
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <IconPlus size={13}/> Add source
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-elev)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 100px 140px 120px 80px 60px',
          padding: '10px 18px', borderBottom: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
          background: 'var(--bg)',
        }}>
          <span>Name</span><span>Type</span><span>Source</span><span>Tag</span><span>Updated</span><span></span>
        </div>
        {ITEMS.map((it, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 100px 140px 120px 80px 60px',
            padding: '14px 18px',
            borderBottom: i < ITEMS.length - 1 ? '1px solid var(--border)' : 'none',
            alignItems: 'center', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {it.pinned && <IconPin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }}/>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
            </span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>{it.type}</span>
            <span style={{ color: 'var(--fg-soft)' }}>{it.source}</span>
            <span>
              <span style={{ padding: '2px 8px', fontSize: 10, background: 'var(--bg-active)', color: 'var(--fg-soft)', borderRadius: 4, letterSpacing: '0.04em' }}>{it.tag}</span>
            </span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>{it.updated}</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <IconMore size={16}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
