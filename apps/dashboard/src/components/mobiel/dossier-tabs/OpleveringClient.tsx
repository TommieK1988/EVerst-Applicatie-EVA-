'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { opleverMomentTypeLabels, type OpleverMomentType } from '@everts/database'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import {
  maakOplevermoment, maakLosOpleverpunt, setPuntStatus, uploadOpleverFoto,
  type DossierOpleveringData, type OpleverPuntView, type OpleverFeedbackSamenvatting, type OpleverToewijsbaar,
} from '@/lib/dossiers/oplevering'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { GROEN, GRIJS, RAND, TEKST, ZACHT, VLAK, OPPERVLAK, veld, label, primaireKnop, secundaireKnop } from '@/components/mobiel/oplevering/stijl'
import Sterren from '@/components/mobiel/oplevering/Sterren'
import PuntKaart from '@/components/mobiel/oplevering/PuntKaart'
import BottomSheet from '@/components/mobiel/BottomSheet'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import { useDialogen } from '@/components/ui/dialogen'

export default function OpleveringClient({ dossierId, data, feedback, toewijsbaar }: {
  dossierId: string
  data: DossierOpleveringData
  feedback: OpleverFeedbackSamenvatting
  toewijsbaar: OpleverToewijsbaar
}) {
  const t = useTranslations('dossiertabs.oplevering')
  const router = useRouter()
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [puntOpen, setPuntOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <Sterrenscore feedback={feedback} />

        {data.triage.length > 0 && (
          <TriageBlok punten={data.triage} onWijzig={() => router.refresh()} />
        )}

        <MomentenBlok momenten={data.momenten} />

        <AandachtspuntenBlok
          punten={data.lossePunten}
          toewijsbaar={toewijsbaar}
          onToevoegen={() => setPuntOpen(true)}
          onWijzig={() => router.refresh()}
        />

        {data.afgewezen.length > 0 && <AfgewezenBlok punten={data.afgewezen} />}
      </div>

      <MobielStickyFooter>
        <button type="button" onClick={() => setNieuwOpen(true)} style={{ ...primaireKnop, width: '100%' }}>
          {t('plusOplevering')}
        </button>
      </MobielStickyFooter>

      {nieuwOpen && (
        <NieuwMomentSheet
          dossierId={dossierId}
          onSluit={() => setNieuwOpen(false)}
          onKlaar={id => router.push(`/m/oplevering/${id}`)}
        />
      )}
      {puntOpen && (
        <NieuwAandachtspuntSheet
          dossierId={dossierId}
          onSluit={() => setPuntOpen(false)}
          onKlaar={() => { setPuntOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}

/* ───────────────────────────── Sterrenscore ──────────────────────────────── */

function Sterrenscore({ feedback }: { feedback: OpleverFeedbackSamenvatting }) {
  const t = useTranslations('dossiertabs.oplevering')
  const locale = useDatumLocale()
  const { hoofdscore, cijfers, aantal } = feedback

  if (aantal === 0) {
    return (
      <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 16, padding: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: GRIJS }}>{t('geenFeedback')}</div>
      </div>
    )
  }

  // Overige cijfers klein eronder; de hoofdscore staat al groot bovenaan.
  const rest = hoofdscore ? cijfers.filter(c => c.label !== hoofdscore.label) : cijfers

  return (
    <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 16, padding: 18 }}>
      {hoofdscore ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 800, color: TEKST, lineHeight: 1 }}>
              {hoofdscore.gemiddelde.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: ZACHT }}>/ {hoofdscore.max}</span>
          </div>
          <Sterren score={hoofdscore.gemiddelde} max={hoofdscore.max} />
          <div style={{ fontSize: 13, color: GRIJS, textAlign: 'center' }}>
            <VertaalbareTekst tekst={hoofdscore.label} label={false} />
            {` · ${t('reacties', { aantal })}`}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 600, color: TEKST }}>
          {t('reactiesOntvangen', { aantal })}
        </div>
      )}

      {rest.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {rest.map(c => (
            <div key={c.label} style={{ background: VLAK, borderRadius: 10, padding: '7px 11px', flex: '1 1 40%' }}>
              <div style={{ fontSize: 11, color: GRIJS, lineHeight: 1.3 }}><VertaalbareTekst tekst={c.label} label={false} /></div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEKST }}>
                {c.gemiddelde.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span style={{ fontSize: 11, fontWeight: 500, color: ZACHT }}> / {c.max}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Nieuwe meldingen ────────────────────────────── */

function TriageBlok({ punten, onWijzig }: { punten: OpleverPuntView[]; onWijzig: () => void }) {
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const { vraagTekst } = useDialogen()
  const t = useTranslations('dossiertabs.oplevering')

  async function beoordeel(punt: OpleverPuntView, status: 'open' | 'afgewezen') {
    let reden: string | null = null
    if (status === 'afgewezen') {
      const antwoord = await vraagTekst({
        titel: t('afwijzenTitel'),
        label: t('afwijzenLabel'),
        meerregelig: true,
        bevestigLabel: t('afwijzen'),
      })
      if (antwoord === null) return
      reden = antwoord.trim() || null
    }
    setBezig(punt.id); setFout(null)
    const r = await setPuntStatus(punt.id, status, { reden })
    setBezig(null)
    if (!r.ok) { setFout(r.error); return }
    onWijzig()
  }

  return (
    <Blok titel={t('nieuweMeldingen', { aantal: punten.length })}>
      {fout && <Fout tekst={fout} />}
      <div style={{ fontSize: 13, color: GRIJS, marginBottom: 4 }}>
        {t('triageUitleg')}
      </div>
      {punten.map(p => (
        <div key={p.id} style={{ border: '1px solid #f0dfb8', background: '#fdf8ec', borderRadius: 12, padding: 12 }}>
          {/* Gemeld door bewoners via een formulier: vertalen, met de weg terug naar het origineel. */}
          <VertaalbareTekst tekst={p.omschrijving} as="div" style={{ fontSize: 14, color: TEKST, lineHeight: 1.4 }} />
          <div style={{ fontSize: 12, color: GRIJS, marginTop: 3 }}>
            {[p.ruimte, p.melder_naam ?? t('anoniem'), p.bronTemplateNaam].filter(Boolean).join(' · ')}
          </div>
          {p.fotos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {p.fotos.map(f => (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={t('fotoBijMelding')} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${RAND}` }} />
                </a>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={bezig === p.id} onClick={() => beoordeel(p, 'open')}
              style={{ ...primaireKnop, flex: 1, padding: '11px 12px', fontSize: 14 }}>
              {t('opDeLijst')}
            </button>
            <button type="button" disabled={bezig === p.id} onClick={() => beoordeel(p, 'afgewezen')}
              style={{ ...secundaireKnop, padding: '11px 14px', fontSize: 14, color: '#b42318' }}>
              {t('afwijzen')}
            </button>
          </div>
        </div>
      ))}
    </Blok>
  )
}

/* ───────────────────────────── Oplevermomenten ───────────────────────────── */

function MomentenBlok({ momenten }: { momenten: DossierOpleveringData['momenten'] }) {
  const t = useTranslations('dossiertabs.oplevering')
  if (momenten.length === 0) {
    return (
      <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: GRIJS, lineHeight: 1.5 }}>
          {t('geenMoment')}<br />{t('maakEenAan')}
        </div>
      </div>
    )
  }

  return (
    <Blok titel={t('opleveringen')}>
      {momenten.map(m => {
        const klaar = m.aantalTotaal > 0 && m.aantalOpen === 0
        return (
          <Link key={m.id} href={`/m/oplevering/${m.id}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 12, padding: '13px 14px',
              borderLeft: `4px solid ${klaar ? GROEN : '#e3e8ea'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <VertaalbareTekst tekst={m.titel} label={false} as="div" style={{ fontSize: 15, fontWeight: 600, color: TEKST, minWidth: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: GRIJS, flexShrink: 0 }}>
                  {t(`momentStatus.${m.status}`)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: GRIJS, marginTop: 3 }}>
                {t(`momentType.${m.type}`)}
                {m.handtekeningen.length > 0 && ` · ${t('ondertekend', { aantal: m.handtekeningen.length })}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: VLAK, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999, background: GROEN,
                    width: m.aantalTotaal > 0 ? `${(m.aantalGeaccepteerd / m.aantalTotaal) * 100}%` : '0%',
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: m.aantalOpen > 0 ? '#b98900' : GROEN, flexShrink: 0 }}>
                  {m.aantalGeaccepteerd}/{m.aantalTotaal}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </Blok>
  )
}

/* ───────────────────────────── Aandachtspunten ───────────────────────────── */

function AandachtspuntenBlok({ punten, toewijsbaar, onToevoegen, onWijzig }: {
  punten: OpleverPuntView[]
  toewijsbaar: OpleverToewijsbaar
  onToevoegen: () => void
  onWijzig: () => void
}) {
  const t = useTranslations('dossiertabs.oplevering')
  const open = punten.filter(p => p.status !== 'geaccepteerd').length

  return (
    <Blok titel={punten.length > 0 ? t('aandachtspuntenOpen', { aantal: open }) : t('aandachtspunten')}>
      {punten.length === 0 ? (
        <div style={{ fontSize: 13, color: GRIJS }}>
          {t('geenAandachtspunten')}
        </div>
      ) : (
        punten.map(p => (
          <PuntKaart key={p.id} punt={p} prefix="AP" toewijsbaar={toewijsbaar} onWijzig={onWijzig} />
        ))
      )}
      <button type="button" onClick={onToevoegen} style={{ ...secundaireKnop, width: '100%', marginTop: 2 }}>
        {t('plusAandachtspunt')}
      </button>
    </Blok>
  )
}

/* ─────────────────────────────── Afgewezen ───────────────────────────────── */

function AfgewezenBlok({ punten }: { punten: OpleverPuntView[] }) {
  const t = useTranslations('dossiertabs.oplevering')
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: VLAK, border: `1px solid ${RAND}`, borderRadius: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '13px 14px', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer',
        }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: GRIJS }}>
          {t('afgewezenMeldingen', { aantal: punten.length })}
        </span>
        <span style={{ fontSize: 12, color: ZACHT }}>{open ? t('verbergen') : t('tonen')}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {punten.map(p => (
            <div key={p.id}>
              <div style={{ fontSize: 13, color: GRIJS, textDecoration: 'line-through' }}><VertaalbareTekst tekst={p.omschrijving} label={false} /></div>
              {p.geweigerd_reden && (
                <div style={{ fontSize: 12, color: ZACHT }}>{t('reden', { reden: p.geweigerd_reden })}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────── Invoer-sheets ──────────────────────────────── */

function NieuwMomentSheet({ dossierId, onSluit, onKlaar }: {
  dossierId: string
  onSluit: () => void
  onKlaar: (id: string) => void
}) {
  const [titel, setTitel] = useState('')
  const [type, setType] = useState<OpleverMomentType>('eindoplevering')
  const t = useTranslations('dossiertabs.oplevering')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan() {
    if (!titel.trim()) { setFout(t('geefTitel')); return }
    setBezig(true); setFout(null)
    const r = await maakOplevermoment(dossierId, { titel: titel.trim(), type })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    // Direct door naar het uitvoerscherm: je maakt een oplevermoment aan omdat je hem gaat lopen.
    onKlaar(r.id)
  }

  return (
    <BottomSheet titel={t('nieuweOplevering')} onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      <div>
        <label style={label} htmlFor="op-titel">{t('titel')}</label>
        <input id="op-titel" style={veld} value={titel} onChange={e => setTitel(e.target.value)}
          placeholder={t('titelPlaceholder')} autoFocus />
      </div>
      <div>
        <label style={label} htmlFor="op-type">{t('type')}</label>
        <select id="op-type" style={veld} value={type} onChange={e => setType(e.target.value as OpleverMomentType)}>
          {(Object.keys(opleverMomentTypeLabels) as OpleverMomentType[]).map(soort => (
            <option key={soort} value={soort}>{t(`momentType.${soort}`)}</option>
          ))}
        </select>
      </div>
      <button type="button" onClick={opslaan} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? t('aanmaken') : t('aanmakenEnStarten')}
      </button>
    </BottomSheet>
  )
}

function NieuwAandachtspuntSheet({ dossierId, onSluit, onKlaar }: {
  dossierId: string
  onSluit: () => void
  onKlaar: () => void
}) {
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const bibliotheekRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('dossiertabs.oplevering')

  /** Aanvullen, niet vervangen: een foto van de camera en een uit de bibliotheek horen bij hetzelfde punt. */
  function voegFotosToe(files: FileList | null) {
    if (!files || files.length === 0) return
    setFotos(bestaand => [...bestaand, ...Array.from(files)])
  }

  async function opslaan() {
    if (!omschrijving.trim()) { setFout(t('beschrijf')); return }
    setBezig(true); setFout(null)
    const r = await maakLosOpleverpunt(dossierId, {
      omschrijving: omschrijving.trim(),
      ruimte: ruimte.trim() || null,
    })
    if (!r.ok) { setBezig(false); setFout(r.error); return }

    // Foto's kunnen pas ná het punt: uploadOpleverFoto hangt ze aan een bestaand punt-id.
    // Een mislukte foto mag het punt zelf niet ongedaan maken — het staat er al.
    for (const file of fotos) {
      const fd = new FormData()
      fd.append('foto', await verkleinFoto(file))
      fd.append('soort', 'voor')
      const f = await uploadOpleverFoto(r.id, fd)
      if (!f.ok) { setBezig(false); setFout(t('fotoMislukt', { fout: f.error })); return }
    }
    setBezig(false)
    onKlaar()
  }

  return (
    <BottomSheet titel={t('aandachtspuntMelden')} onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      <div>
        <label style={label} htmlFor="ap-oms">{t('watIsEr')}</label>
        {/* Inspreken in plaats van typen: op locatie scheelt dat bij een ronde veel tijd. */}
        <SpraakTextarea id="ap-oms" style={{ ...veld, minHeight: 88, resize: 'vertical' }}
          value={omschrijving} onChange={setOmschrijving}
          placeholder={t('omschrijvingPlaceholder')} />
      </div>
      <div>
        <label style={label} htmlFor="ap-ruimte">{t('ruimte')}</label>
        <input id="ap-ruimte" style={veld} value={ruimte} onChange={e => setRuimte(e.target.value)}
          placeholder={t('ruimtePlaceholder')} />
      </div>
      <div>
        <span style={label}>{t('fotos')}</span>
        {/* Camera en bibliotheek apart: `capture` dwingt de camera af, zonder dat kenmerk kies je
            een bestaande foto. Meestal fotografeer je ter plekke, maar soms staat het beeld er al. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
            onChange={e => { voegFotosToe(e.target.files); e.target.value = '' }} />
          <input ref={bibliotheekRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { voegFotosToe(e.target.files); e.target.value = '' }} />
          <button type="button" onClick={() => cameraRef.current?.click()}
            style={{ ...secundaireKnop, flex: 1, fontSize: 14 }}>
            {t('fotoMaken')}
          </button>
          <button type="button" onClick={() => bibliotheekRef.current?.click()}
            style={{ ...secundaireKnop, flex: 1, fontSize: 14 }}>
            {t('uitBibliotheek')}
          </button>
        </div>
        {fotos.length > 0 && (
          <div style={{ fontSize: 12, color: GRIJS, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{t('fotosGekozen', { aantal: fotos.length })}</span>
            <button type="button" onClick={() => setFotos([])}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: GRIJS, textDecoration: 'underline', cursor: 'pointer' }}>
              {t('wissen')}
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={opslaan} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? t('opslaanBezig') : t('opslaan')}
      </button>
    </BottomSheet>
  )
}

/* ───────────────────────────── Kleine bouwstenen ─────────────────────────── */

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 8,
      }}>
        {titel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Fout({ tekst }: { tekst: string }) {
  return (
    <div style={{
      background: '#fdf1f0', border: '1px solid #f0c8c2', color: '#b42318',
      borderRadius: 10, padding: '10px 12px', fontSize: 13,
    }}>
      {tekst}
    </div>
  )
}
