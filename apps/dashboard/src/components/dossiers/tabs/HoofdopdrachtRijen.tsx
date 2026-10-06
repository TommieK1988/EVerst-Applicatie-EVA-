'use client'

import { Fragment, useState } from 'react'
import type { HoofdOnderdeel, ResultaatPost } from '@/lib/dossiers/resultaat-per-code'
import { fmt } from './financieel-ui'
import { PostRij, RAND } from './resultaat-rijen'

/**
 * De Hoofdopdracht in Verwacht resultaat, uitklapbaar tot de bewakingscodes waaruit zijn prognose
 * bestaat. Eerst de codes die aan de Hoofdopdracht gekoppeld zijn (per Bouw7-hoofdstuk), daarna
 * "Nog niet gekoppeld". Alleen een indeling: de bedragen op de Hoofdopdracht-regel veranderen niet,
 * en de onderdelen tonen alleen hun prognose — er is per bewakingscode geen verkoopbedrag.
 */
export default function HoofdopdrachtRijen({ post }: { post: ResultaatPost }) {
  const [open, setOpen] = useState(false)
  const onderdelen = post.onderdelen ?? []
  const gekoppeld = onderdelen.filter(o => o.gekoppeld)
  const los = onderdelen.filter(o => !o.gekoppeld)

  const knop = onderdelen.length > 0 && (
    <button
      type="button"
      onClick={() => setOpen(v => !v)}
      aria-expanded={open}
      aria-label={open ? 'Bewakingscodes verbergen' : 'Bewakingscodes tonen'}
      style={{
        marginRight: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
        color: 'var(--neutral-500)', fontSize: 11, width: 12, display: 'inline-block',
      }}
    >
      {open ? '▾' : '▸'}
    </button>
  )

  // Tussenkop per hoofdstuk binnen de gekoppelde codes.
  const perHoofdstuk: { hoofdstuk: string; codes: HoofdOnderdeel[] }[] = []
  for (const o of gekoppeld) {
    const naam = o.hoofdstuk ?? 'Zonder hoofdstuk'
    const laatste = perHoofdstuk[perHoofdstuk.length - 1]
    if (laatste?.hoofdstuk === naam) laatste.codes.push(o)
    else perHoofdstuk.push({ hoofdstuk: naam, codes: [o] })
  }

  return (
    <>
      <PostRij post={post} voor={knop} />
      {open && (
        <>
          {perHoofdstuk.map(g => (
            <Fragment key={`h-${g.hoofdstuk}`}>
              <TussenKop>{g.hoofdstuk}</TussenKop>
              {g.codes.map(o => <OnderdeelRij key={o.code} o={o} />)}
            </Fragment>
          ))}
          {los.length > 0 && (
            <>
              <TussenKop gedempt>Nog niet gekoppeld</TussenKop>
              {los.map(o => <OnderdeelRij key={o.code} o={o} metHoofdstuk />)}
            </>
          )}
        </>
      )}
    </>
  )
}

function TussenKop({ children, gedempt }: { children: React.ReactNode; gedempt?: boolean }) {
  return (
    <tr>
      <td colSpan={5} style={{
        padding: '8px 12px 4px 32px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: gedempt ? 'var(--neutral-400)' : 'var(--neutral-500)',
        fontStyle: gedempt ? 'italic' : undefined, borderBottom: RAND,
      }}>
        {children}
      </td>
    </tr>
  )
}

const cel: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, textAlign: 'right', color: 'var(--neutral-600)',
  borderBottom: RAND, whiteSpace: 'nowrap',
}

function OnderdeelRij({ o, metHoofdstuk }: { o: HoofdOnderdeel; metHoofdstuk?: boolean }) {
  return (
    <tr>
      <td
        title={[o.naam, o.code, o.hoofdstuk].filter(Boolean).join(' · ')}
        style={{
          padding: '4px 12px 4px 48px', fontSize: 12, color: 'var(--neutral-700)', borderBottom: RAND,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {o.naam && o.naam !== o.code ? o.naam : o.code}
        {o.naam && o.naam !== o.code && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--neutral-400)', fontFamily: 'var(--font-mono, monospace)' }}>
            {o.code}
          </span>
        )}
        {metHoofdstuk && o.hoofdstuk && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--neutral-400)' }}>{o.hoofdstuk}</span>
        )}
      </td>
      <td style={cel} />
      <td style={cel}>{fmt(Math.round(o.prognose * 100) / 100, true)}</td>
      <td style={cel} />
      <td style={cel} />
    </tr>
  )
}
