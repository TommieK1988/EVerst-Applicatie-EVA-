'use client'

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import HandtekeningPad from '@/components/planning/werkbon/HandtekeningPad'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import SlideRenderer from '@/components/toolbox/SlideRenderer'
import { useVertaling, useVertalingen } from '@/components/vertalen/useVertaling'
import { VertaalLabel } from '@/components/vertalen/VertaalbareTekst'
import {
  startOfHervat, bewaarVoortgang, beantwoordVraag, rondAf,
  type DeelnameData,
} from '@/lib/toolbox/deelname'
import type { ContentSlide } from '@/components/toolbox/types'
import type { PubliekeVraagSlide } from '@/lib/toolbox/schema'

type Fase = 'slides' | 'vragen' | 'aftekenen' | 'klaar'
type Vt = <T extends string | null | undefined>(tekst: T) => T

/**
 * Alle teksten van kantoor in een toolbox (titel, slides, vragen en opties),
 * zodat ze in één verzoek vertaald worden.
 */
function toolboxTeksten(deelname: DeelnameData): string[] {
  const uit: string[] = [deelname.titel]
  for (const s of deelname.schema.slides) {
    if (s.type === 'content') {
      if (s.titel) uit.push(s.titel)
      for (const b of s.blokken) {
        if (b.type === 'kop' || b.type === 'tekst') uit.push(b.tekst)
        else if (b.type === 'afbeelding' && b.bijschrift) uit.push(b.bijschrift)
        else if (b.type === 'video' && b.titel) uit.push(b.titel)
      }
    } else {
      uit.push(s.vraag)
      for (const o of s.opties) uit.push(o.tekst)
    }
  }
  return uit
}

/** Dezelfde slide met vertaalde teksten — alleen voor de weergave. */
function vertaalSlide(slide: ContentSlide, vt: Vt): ContentSlide {
  return {
    ...slide,
    titel: vt(slide.titel),
    blokken: slide.blokken.map((b) => {
      if (b.type === 'kop' || b.type === 'tekst') return { ...b, tekst: vt(b.tekst) }
      if (b.type === 'afbeelding') return { ...b, bijschrift: vt(b.bijschrift) }
      if (b.type === 'video') return { ...b, titel: vt(b.titel) }
      return b
    }),
  }
}

/**
 * De toolbox doorlopen op de telefoon.
 *
 * In een andere taal dan Nederlands wordt de inhoud van kantoor (titel, slides,
 * vragen, opties, uitleg) in één bundel vertaald, met één "Automatisch vertaald ·
 * Toon origineel"-label bovenaan voor de hele toolbox — het zijn
 * veiligheidsinstructies, het origineel is altijd één tik weg. Alleen de
 * weergave wordt vertaald: antwoorden gaan op optie-id naar de server, en de
 * naam en handtekening worden opgeslagen zoals ingevuld.
 */

export default function ToolboxDoorloop({
  deelname, standaardNaam,
}: {
  deelname: DeelnameData
  standaardNaam: string
}) {
  const router = useRouter()
  const t = useTranslations('toolbox')

  const vertalingen = useVertalingen(toolboxTeksten(deelname))
  const [origineel, setOrigineel] = useState(false)
  const vertaalKaart = new Map(vertalingen.map((v) => [v.origineel, v.tekst]))
  const vertaald = vertalingen.some((v) => v.vertaald)
  const vt: Vt = (tekst) => (!tekst || origineel ? tekst : ((vertaalKaart.get(tekst) ?? tekst) as typeof tekst))

  const contentSlides = useMemo(
    () => deelname.schema.slides.filter((s): s is ContentSlide => s.type === 'content'),
    [deelname.schema],
  )
  const vraagSlides = useMemo(
    () => deelname.schema.slides.filter((s): s is PubliekeVraagSlide => s.type === 'vraag'),
    [deelname.schema],
  )

  const alAfgerond = deelname.status === 'afgerond'
  const [fase, setFase] = useState<Fase>(alAfgerond ? 'klaar' : 'slides')
  const [slideIdx, setSlideIdx] = useState(Math.min(deelname.laatsteSlide, Math.max(0, contentSlides.length - 1)))
  const [vraagIdx, setVraagIdx] = useState(0)

  useEffect(() => {
    if (!alAfgerond) void startOfHervat(deelname.toewijzingId)
  }, [alAfgerond, deelname.toewijzingId])

  const totaalStappen = contentSlides.length + vraagSlides.length
  const huidigeStap = fase === 'slides' ? slideIdx : contentSlides.length + vraagIdx
  const progressiePct = totaalStappen > 0 ? Math.round(((huidigeStap) / totaalStappen) * 100) : 0

  // ── Slides-fase ─────────────────────────────────────────────────────
  function volgendeSlide() {
    if (slideIdx < contentSlides.length - 1) {
      const next = slideIdx + 1
      setSlideIdx(next)
      void bewaarVoortgang(deelname.toewijzingId, next)
    } else {
      // Naar de kennischeck (of direct aftekenen als er geen vragen zijn).
      setFase(vraagSlides.length > 0 ? 'vragen' : 'aftekenen')
    }
  }
  function vorigeSlide() {
    if (slideIdx > 0) setSlideIdx(slideIdx - 1)
  }

  if (alAfgerond || fase === 'klaar') {
    return <KlaarScherm titel={vt(deelname.titel)} onTerug={() => router.push('/m/taken')} alAfgerond={alAfgerond} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg-elev)' }}>
      {/* Voortgangsbalk */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #eef1f2' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{vt(deelname.titel)}</span>
          <span style={{ fontSize: 11, color: '#6b757c', flexShrink: 0, marginLeft: 8 }}>
            {fase === 'vragen'
              ? t('vraagVan', { nr: vraagIdx + 1, totaal: vraagSlides.length })
              : t('slideVan', { nr: slideIdx + 1, totaal: contentSlides.length })}
          </span>
        </div>
        {vertaald && (
          <div style={{ marginBottom: 6 }}>
            <VertaalLabel origineel={origineel} wissel={() => setOrigineel((o) => !o)} />
          </div>
        )}
        <div style={{ height: 4, borderRadius: 2, background: '#eef1f2', overflow: 'hidden' }}>
          <div style={{ width: `${progressiePct}%`, height: '100%', background: '#009439', transition: 'width .2s' }} />
        </div>
      </div>

      {fase === 'slides' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {contentSlides[slideIdx] && <SlideRenderer slide={vertaalSlide(contentSlides[slideIdx], vt)} />}
          </div>
          <MobielStickyFooter>
            {slideIdx > 0 && (
              <button onClick={vorigeSlide} style={knopSecundair}>{t('vorige')}</button>
            )}
            <button onClick={volgendeSlide} style={knopPrimair}>
              {slideIdx < contentSlides.length - 1 ? t('volgende') : vraagSlides.length > 0 ? t('naarVragen') : t('naarAftekenen')}
            </button>
          </MobielStickyFooter>
        </>
      )}

      {fase === 'vragen' && vraagSlides[vraagIdx] && (
        <VraagScherm
          key={vraagSlides[vraagIdx].id}
          toewijzingId={deelname.toewijzingId}
          vraag={vraagSlides[vraagIdx]}
          vt={vt}
          origineel={origineel}
          onGoed={() => {
            if (vraagIdx < vraagSlides.length - 1) setVraagIdx(vraagIdx + 1)
            else setFase('aftekenen')
          }}
        />
      )}

      {fase === 'aftekenen' && (
        <AftekenScherm
          toewijzingId={deelname.toewijzingId}
          standaardNaam={standaardNaam}
          onKlaar={() => setFase('klaar')}
        />
      )}
    </div>
  )
}

// ── Vraag ────────────────────────────────────────────────────────────────
function VraagScherm({
  toewijzingId, vraag, vt, origineel, onGoed,
}: {
  toewijzingId: string
  vraag: PubliekeVraagSlide
  /** Vertaalt vraag en opties (of geeft het origineel, volgens het label bovenaan). */
  vt: Vt
  origineel: boolean
  onGoed: () => void
}) {
  const t = useTranslations('toolbox')
  const [gekozen, setGekozen] = useState<string | null>(null)
  const [fout, setFout] = useState<{ optieId: string; uitleg?: string } | null>(null)
  const [goed, setGoed] = useState(false)
  const [pending, startTransition] = useTransition()
  // De uitleg komt pas van de server na een fout antwoord; die apart vertalen.
  const uitleg = useVertaling(fout?.uitleg)

  function kies(optieId: string) {
    if (pending || goed) return
    setGekozen(optieId)
    startTransition(async () => {
      try {
        const res = await beantwoordVraag(toewijzingId, vraag.id, optieId)
        if (res.correct) { setGoed(true); setFout(null) }
        else setFout({ optieId, uitleg: res.uitleg })
      } catch {
        setGekozen(null)
      }
    })
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginBottom: 18, lineHeight: 1.3 }}>{vt(vraag.vraag)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vraag.opties.map((o, i) => {
            const isGekozen = gekozen === o.id
            const isFout = fout?.optieId === o.id
            const isGoed = goed && isGekozen
            let border = '#e3e8ea', bg = '#fff', kleur = '#161b20'
            if (isGoed) { border = '#12b76a'; bg = '#ecfdf3'; kleur = '#067647' }
            else if (isFout) { border = '#f04438'; bg = '#fef3f2'; kleur = '#b42318' }
            return (
              <button
                key={o.id}
                onClick={() => kies(o.id)}
                disabled={pending || goed}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  padding: '14px 16px', borderRadius: 12, border: `2px solid ${border}`,
                  background: bg, color: kleur, fontSize: 15, fontWeight: 600,
                  cursor: goed ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ fontWeight: 800, opacity: 0.6 }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1 }}>{vt(o.tekst)}</span>
                {isGoed && <span>✓</span>}
                {isFout && <span>✕</span>}
              </button>
            )
          })}
        </div>

        {fout && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#fff6ec', border: '1px solid #f5c67c' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8a5200', marginBottom: fout.uitleg ? 6 : 0 }}>
              {t('nietJuist')}
            </div>
            {fout.uitleg && (
              <div style={{ fontSize: 13, color: '#6b4b12', lineHeight: 1.5 }}>
                {origineel ? uitleg.origineel : uitleg.tekst}
              </div>
            )}
          </div>
        )}
      </div>

      <MobielStickyFooter>
        <button onClick={onGoed} disabled={!goed} style={goed ? knopPrimair : knopUit}>
          {t('volgende')}
        </button>
      </MobielStickyFooter>
    </>
  )
}

// ── Aftekenen ──────────────────────────────────────────────────────────
function AftekenScherm({
  toewijzingId, standaardNaam, onKlaar,
}: {
  toewijzingId: string
  standaardNaam: string
  onKlaar: () => void
}) {
  const t = useTranslations('toolbox')
  const [naam, setNaam] = useState(standaardNaam)
  const [fout, setFout] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const handtekening = useRef<string | null>(null)

  function afronden() {
    setFout(null)
    if (!naam.trim()) { setFout(t('fout.naamLeeg')); return }
    if (!handtekening.current) { setFout(t('fout.geenHandtekening')); return }
    startTransition(async () => {
      const res = await rondAf(toewijzingId, { naam, handtekeningB64: handtekening.current! })
      if (!res.ok) { setFout(res.error); return }
      onKlaar()
    })
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg)', marginBottom: 6 }}>{t('aftekenen')}</div>
        <div style={{ fontSize: 14, color: '#6b757c', marginBottom: 18, lineHeight: 1.5 }}>
          {t('aftekenenUitleg')}
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a444b', marginBottom: 6 }}>{t('naam')}</label>
        <input
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 16, marginBottom: 18 }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a444b', marginBottom: 6 }}>{t('handtekening')}</label>
        <HandtekeningPad onChange={(d) => { handtekening.current = d }} />

        {fout && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#fef3f2', border: '1px solid #f5b5ae', color: '#b42318', fontSize: 13 }}>
            {fout}
          </div>
        )}
      </div>

      <MobielStickyFooter>
        <button onClick={afronden} disabled={pending} style={knopPrimair}>
          {pending ? t('bezig') : t('afronden')}
        </button>
      </MobielStickyFooter>
    </>
  )
}

// ── Klaar ────────────────────────────────────────────────────────────────
function KlaarScherm({ titel, onTerug, alAfgerond }: { titel: string; onTerug: () => void; alAfgerond: boolean }) {
  const t = useTranslations('toolbox')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', background: 'var(--bg-elev)' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ecfdf3', display: 'grid', placeItems: 'center', marginBottom: 20 }}>
        <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#12b76a" strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></svg>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', marginBottom: 8 }}>
        {alAfgerond ? t('alAfgerond') : t('afgerond')}
      </div>
      <div style={{ fontSize: 14, color: '#6b757c', marginBottom: 28, maxWidth: 280 }}>
        {alAfgerond ? t('eerderAfgetekend', { titel }) : t('doorlopenAfgetekend', { titel })}
      </div>
      <button onClick={onTerug} style={{ ...knopPrimair, maxWidth: 240 }}>{t('terugNaarActies')}</button>
    </div>
  )
}

// ── Knopstijlen ────────────────────────────────────────────────────────
const knopPrimair: React.CSSProperties = {
  flex: 1, padding: '14px 18px', borderRadius: 12, border: 'none',
  background: '#009439', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
}
const knopSecundair: React.CSSProperties = {
  padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
  background: 'var(--bg-elev)', color: 'var(--fg)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
}
const knopUit: React.CSSProperties = {
  flex: 1, padding: '14px 18px', borderRadius: 12, border: 'none',
  background: '#e3e8ea', color: '#98a2b3', fontSize: 16, fontWeight: 700, cursor: 'default',
}
