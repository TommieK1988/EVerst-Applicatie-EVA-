'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search, ChevronRight, FileText } from 'lucide-react'
import { zoek } from '@/lib/handboek/zoeken'
import { bijlageUrl, leesbareGrootte } from '@/lib/handboek/bijlagen'
import { sectiePad, urlSlug } from '@/lib/handboek/paden'
import type { Bijlage, ZoekRegel } from '@/lib/handboek/types'
import { useTaal } from '@/i18n/client'
import SituatieKaart from './SituatieKaart'
import { usePaginaVertaling } from './handboek-vertaling'

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
 *
 * In een andere taal dan Nederlands worden titels, samenvattingen en
 * bijlagenamen in één bundel vertaald, met één "Toon origineel"-label voor het
 * hele scherm. Zoeken blijft op de Nederlandse bron werken (de index is
 * Nederlands); de titels van de treffers worden wel vertaald getoond.
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
  const t = useTranslations('handboek')
  const taal = useTaal()
  const { vt, label } = usePaginaVertaling([
    ...situaties.map((s) => s.titel),
    ...hoofdstukken.flatMap((h) => [h.titel, h.samenvatting]),
    ...bijlagen.flatMap((b) => [b.titel, b.omschrijving]),
    ...new Set(index.map((r) => r.sectieTitel)),
  ])

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
          placeholder={t('zoekPlaceholder')}
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
      {taal !== 'nl' && (
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '6px 2px 0' }}>
          {t('zoekenInNederlands')}
        </p>
      )}
      {label && <div style={{ marginTop: 8 }}>{label}</div>}

      {zoekt ? (
        <Resultaten treffers={treffers} vraag={vraag} vt={vt} />
      ) : (
        <>
          {situaties.length > 0 && (
            <Sectie titel={t('watTeDoenBij')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {situaties.map((s) => (
                  <SituatieKaart key={s.slug} slug={urlSlug(s.slug)} titel={vt(s.titel)} icoon={s.icoon} />
                ))}
              </div>
            </Sectie>
          )}

          <Sectie titel={t('hoofdstukken')}>
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
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{vt(h.titel)}</span>
                    {h.samenvatting && (
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {vt(h.samenvatting)}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </Sectie>

          {bijlagen.length > 0 && (
            <Sectie titel={t('bijlagen')}>
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
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{vt(b.titel)}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {[vt(b.omschrijving), leesbareGrootte(b.grootte)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
              {/* Zonder deze regel lijkt het een bug dat een term uit het
                  VCA-boek geen zoekresultaat oplevert. */}
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 8 }}>
                {t('bijlagenUitleg')}
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
  treffers, vraag, vt,
}: {
  treffers: ReturnType<typeof zoek>
  vraag: string
  /** Vertaalt de sectietitel; het fragment blijft Nederlands, want daarin staat de treffer. */
  vt: (tekst: string) => string
}) {
  const t = useTranslations('handboek')
  if (!treffers.length) {
    return (
      <div style={{ marginTop: 26, textAlign: 'center', color: 'var(--fg-muted)' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t('nietsGevonden')}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          {t('nietsGevondenTip')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {treffers.map((tr) => (
        <Link
          key={tr.blokId}
          href={sectiePad(
            { slug: tr.sectieSlug, soort: tr.sectieSoort },
            { vraag, blokId: tr.blokId },
          )}
          style={{
            display: 'block', padding: '11px 12px', borderRadius: 11,
            background: 'var(--bg-elev)', border: '1px solid var(--border)',
            textDecoration: 'none', color: 'var(--fg)',
          }}
        >
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#009439', marginBottom: 3 }}>
            {vt(tr.sectieTitel)}
          </span>
          <span style={{ display: 'block', fontSize: 14, lineHeight: 1.45, color: 'var(--fg-muted)' }}>
            {tr.delen.map((d, n) =>
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
