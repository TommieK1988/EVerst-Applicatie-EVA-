'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronRight, FileText } from 'lucide-react'
import { zoek } from '@/lib/handboek/zoeken'
import { bijlageUrl, leesbareGrootte } from '@/lib/handboek/bijlagen'
import { sectiePad, urlSlug } from '@/lib/handboek/paden'
import type { Bijlage, ZoekRegel } from '@/lib/handboek/types'
import SituatieKaart from './SituatieKaart'

type SectieKort = {
  slug: string
  titel: string
  samenvatting: string | null
  icoon: string | null
}

/**
 * Startscherm van het handboek op de telefoon.
 *
 * Volgorde is een keuze, geen toeval: eerst een smal zoekveld (één tik, neemt
 * geen ruimte), dan de "Wat te doen bij"-kaarten, dan pas de hoofdstukken.
 * Dit scherm wordt namelijk op twee heel verschillende momenten geopend — als
 * er iets misgaat, en als je iets wilt opzoeken — en het eerste moment wint.
 *
 * De index is al op de server gefilterd op wat déze medewerker mag zien; er
 * staat hier dus geen tekst in de HTML die de lezer niet had mogen krijgen.
 */
export default function HandboekOverzicht({
  index, situaties, hoofdstukken, bijlagen,
}: {
  index: ZoekRegel[]
  situaties: SectieKort[]
  hoofdstukken: SectieKort[]
  bijlagen: Bijlage[]
}) {
  const [vraag, setVraag] = useState('')
  const treffers = useMemo(() => (vraag.trim() ? zoek(index, vraag) : []), [index, vraag])
  const zoekt = vraag.trim().length > 0

  return (
    <div style={{ padding: 14 }}>
      <label style={{ position: 'relative', display: 'block' }}>
        <Search
          size={18}
          aria-hidden
          style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--fg-muted)', pointerEvents: 'none',
          }}
        />
        <input
          type="search"
          value={vraag}
          onChange={(e) => setVraag(e.target.value)}
          placeholder="Zoek op onderwerp"
          // 16px of groter: bij een kleinere maat zoomt iOS het hele scherm in
          // zodra het veld focus krijgt, en daarna staat de lijst scheef.
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 12px 12px 38px', fontSize: 16,
            borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-elev)', color: 'var(--fg)',
          }}
        />
      </label>

      {zoekt ? (
        <Resultaten treffers={treffers} vraag={vraag} />
      ) : (
        <>
          {situaties.length > 0 && (
            <Sectie titel="Wat te doen bij…">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {situaties.map((s) => (
                  <SituatieKaart key={s.slug} slug={urlSlug(s.slug)} titel={s.titel} icoon={s.icoon} />
                ))}
              </div>
            </Sectie>
          )}

          <Sectie titel="Hoofdstukken">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hoofdstukken.map((h) => (
                <Link
                  key={h.slug}
                  href={sectiePad({ slug: h.slug, soort: 'hoofdstuk' })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '13px 12px', borderRadius: 11,
                    background: 'var(--bg-elev)', border: '1px solid var(--border)',
                    textDecoration: 'none', color: 'var(--fg)',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{h.titel}</span>
                    {h.samenvatting && (
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {h.samenvatting}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </Sectie>

          {bijlagen.length > 0 && (
            <Sectie titel="Bijlagen">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bijlagen.map((b) => (
                  <a
                    key={b.id}
                    href={bijlageUrl(b.id)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11,
                      padding: '12px', borderRadius: 11,
                      background: 'var(--bg-elev)', border: '1px solid var(--border)',
                      textDecoration: 'none', color: 'var(--fg)',
                    }}
                  >
                    <FileText size={20} style={{ color: '#009439', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{b.titel}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {[b.omschrijving, leesbareGrootte(b.grootte)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
              {/* Zonder deze regel lijkt het een bug dat een term uit het
                  VCA-boek geen zoekresultaat oplevert. */}
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 8 }}>
                Bijlagen open je als pdf. De tekst erin doet niet mee in het zoeken.
              </p>
            </Sectie>
          )}
        </>
      )}
    </div>
  )
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
      }}>
        {titel}
      </div>
      {children}
    </div>
  )
}

function Resultaten({
  treffers, vraag,
}: {
  treffers: ReturnType<typeof zoek>
  vraag: string
}) {
  if (!treffers.length) {
    return (
      <div style={{ marginTop: 26, textAlign: 'center', color: 'var(--fg-muted)' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Niets gevonden</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          Probeer een ander woord, of blader door de hoofdstukken.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {treffers.map((t) => (
        <Link
          key={t.blokId}
          href={sectiePad(
            { slug: t.sectieSlug, soort: t.sectieSoort },
            { vraag, blokId: t.blokId },
          )}
          style={{
            display: 'block', padding: '11px 12px', borderRadius: 11,
            background: 'var(--bg-elev)', border: '1px solid var(--border)',
            textDecoration: 'none', color: 'var(--fg)',
          }}
        >
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#009439', marginBottom: 3 }}>
            {t.sectieTitel}
          </span>
          <span style={{ display: 'block', fontSize: 14, lineHeight: 1.45, color: 'var(--fg-muted)' }}>
            {t.delen.map((d, n) =>
              d.raak ? (
                <mark key={n} style={{ background: 'rgba(0,148,57,.18)', color: 'var(--fg)', borderRadius: 3 }}>
                  {d.tekst}
                </mark>
              ) : (
                <React.Fragment key={n}>{d.tekst}</React.Fragment>
              ),
            )}
          </span>
        </Link>
      ))}
    </div>
  )
}
