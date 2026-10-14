'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  uploadOpleverFoto, verwijderOpleverFoto, verwijderOpleverpunt, type OpleverPuntView,
} from '@/lib/dossiers/oplevering'
import { maakGoedPunt, updateMomentTeksten } from '@/lib/dossiers/oplever-goed'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { useDialogen } from '@/components/ui/dialogen'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import BottomSheet from '../BottomSheet'
import { FotoRij } from './PuntKaart'
import { GROEN, GRIJS, RAND, TEKST, ZACHT, ROOD, veld, label, primaireKnop, secundaireKnop } from './stijl'

/**
 * "Goed uitgevoerd" en "Opmerkingen en afspraken" in de opleverdoorloop op de telefoon.
 *
 * Een goed punt is een foto met een korte omschrijving, meteen akkoord — in het rapport krijgt het
 * een eigen hoofdstuk. Geen status, toewijzing of na-foto: er valt niets te herstellen.
 */

async function uploadAlles(puntId: string, files: File[]): Promise<string | null> {
  for (const file of files) {
    const fd = new FormData()
    fd.append('foto', await verkleinFoto(file))
    fd.append('soort', 'algemeen')
    const r = await uploadOpleverFoto(puntId, fd)
    if (!r.ok) return r.error
  }
  return null
}

export function GoedPuntKaart({ punt, nr, onWijzig }: {
  punt: OpleverPuntView
  nr: number
  onWijzig: () => void
}) {
  const t = useTranslations('oplevering')
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const { bevestig } = useDialogen()

  async function fotos(files: FileList | null) {
    if (!files?.length) return
    setBezig(true); setFout(null)
    const f = await uploadAlles(punt.id, Array.from(files))
    setBezig(false)
    if (f) setFout(f)
    onWijzig()
  }
  async function fotoWeg(id: string) {
    setBezig(true)
    const r = await verwijderOpleverFoto(id)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onWijzig()
  }
  async function verwijder() {
    if (!await bevestig({ titel: t('goed.bevestigVerwijderen'), bevestigLabel: t('goed.verwijderen'), destructief: true })) return
    setBezig(true)
    const r = await verwijderOpleverpunt(punt.id)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onWijzig()
  }

  const [hoofd, ...rest] = punt.fotos
  return (
    <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left', background: 'none', border: 'none', font: 'inherit',
        padding: '12px 14px', cursor: 'pointer', borderLeft: `4px solid ${GROEN}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: ZACHT }}>G{String(nr).padStart(2, '0')}</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: GROEN }}>
            {t('goed.label')}
          </span>
        </div>
        <VertaalbareTekst as="div" label={false} tekst={punt.omschrijving}
          style={{ fontSize: 14.5, color: TEKST, lineHeight: 1.4, marginTop: 3 }} />
        {punt.ruimte && <div style={{ fontSize: 12, color: GRIJS, marginTop: 3 }}>{punt.ruimte}</div>}
        {hoofd && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hoofd.url} alt={t('goed.label')}
            style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginTop: 8, border: `1px solid ${RAND}` }} />
        )}
        {rest.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {rest.map(f => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={f.url} alt={t('goed.label')}
                style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `1px solid ${RAND}` }} />
            ))}
          </div>
        )}
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${RAND}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fout && <Fout tekst={fout} />}
          <FotoRij label={t('goed.fotoToevoegen')} disabled={bezig} onKies={fotos} />
          {punt.fotos.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 6 }}>{t('punt.fotoVerwijderen')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {punt.fotos.map(f => (
                  <button key={f.id} type="button" disabled={bezig} onClick={() => fotoWeg(f.id)} style={{
                    position: 'relative', padding: 0, border: `1px solid ${RAND}`, borderRadius: 8,
                    overflow: 'hidden', background: 'none', cursor: 'pointer', lineHeight: 0,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={t('punt.fotoVerwijderen')} style={{ width: 56, height: 56, objectFit: 'cover' }} />
                    <span style={{
                      position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,.55)', color: '#fff',
                      fontSize: 11, lineHeight: '16px', width: 16, height: 16, borderBottomLeftRadius: 6,
                    }}>×</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" disabled={bezig} onClick={verwijder}
            style={{ ...secundaireKnop, width: '100%', color: ROOD }}>
            {t('goed.verwijderen')}
          </button>
        </div>
      )}
    </div>
  )
}

export function NieuwGoedPuntSheet({ momentId, onSluit, onKlaar }: {
  momentId: string
  onSluit: () => void
  onKlaar: () => void
}) {
  const t = useTranslations('oplevering')
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan() {
    if (!omschrijving.trim()) { setFout(t('goed.foutLeeg')); return }
    setBezig(true); setFout(null)
    const r = await maakGoedPunt(momentId, { omschrijving, ruimte })
    if (!r.ok) { setBezig(false); setFout(r.error); return }
    // Een mislukte foto maakt het punt niet ongedaan — het staat er al; foto later toevoegen kan.
    const f = await uploadAlles(r.id, fotos)
    setBezig(false)
    if (f) { setFout(t('goed.fotoMislukt', { fout: f })); return }
    onKlaar()
  }

  return (
    <BottomSheet titel={t('goed.titel')} onSluit={onSluit}>
      {fout && <Fout tekst={fout} />}
      <div>
        <label style={label} htmlFor="goed-oms">{t('goed.omschrijving')}</label>
        <SpraakTextarea id="goed-oms" style={{ ...veld, minHeight: 88, resize: 'vertical' }}
          value={omschrijving} onChange={setOmschrijving} placeholder={t('goed.omschrijvingPlaceholder')} />
      </div>
      <div>
        <label style={label} htmlFor="goed-ruimte">{t('nieuwPunt.ruimte')}</label>
        <input id="goed-ruimte" style={veld} value={ruimte} onChange={e => setRuimte(e.target.value)}
          placeholder={t('nieuwPunt.ruimtePlaceholder')} />
      </div>
      <div>
        <span style={label}>{t('punt.fotos')}</span>
        <FotoRij label={t('goed.fotoToevoegen')} disabled={bezig}
          onKies={files => { if (files?.length) setFotos(b => [...b, ...Array.from(files)]) }} />
        {fotos.length > 0 && (
          <div style={{ fontSize: 12, color: GRIJS, marginTop: 6 }}>{t('goed.fotosGekozen', { aantal: fotos.length })}</div>
        )}
      </div>
      <button type="button" onClick={opslaan} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
        {bezig ? t('nieuwPunt.opslaan') : t('nieuwPunt.knopToevoegen')}
      </button>
    </BottomSheet>
  )
}

/** Algemene opmerkingen + afspraken van het moment: tonen, en via een paneel invullen. */
export function MomentTekstenBlok({ momentId, opmerking, afspraken, onWijzig }: {
  momentId: string
  opmerking: string | null
  afspraken: string | null
  onWijzig: () => void
}) {
  const t = useTranslations('oplevering')
  const [open, setOpen] = useState(false)
  const [conceptOpmerking, setConceptOpmerking] = useState(opmerking ?? '')
  const [conceptAfspraken, setConceptAfspraken] = useState(afspraken ?? '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan() {
    setBezig(true); setFout(null)
    const r = await updateMomentTeksten(momentId, { opmerking: conceptOpmerking, afspraken: conceptAfspraken })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    setOpen(false); onWijzig()
  }

  const regel = (kop: string, tekst: string | null) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: GRIJS, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{kop}</div>
      {tekst
        ? <VertaalbareTekst as="div" tekst={tekst} style={{ fontSize: 14, color: TEKST, whiteSpace: 'pre-line', marginTop: 2 }} />
        : <div style={{ fontSize: 13, color: ZACHT, marginTop: 2 }}>{t('teksten.leeg')}</div>}
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {regel(t('teksten.opmerking'), opmerking)}
      {regel(t('teksten.afspraken'), afspraken)}
      <button type="button" onClick={() => setOpen(true)} style={{ ...secundaireKnop, width: '100%' }}>
        {t('teksten.knopInvullen')}
      </button>
      {open && (
        <BottomSheet titel={t('teksten.titel')} onSluit={() => setOpen(false)}>
          {fout && <Fout tekst={fout} />}
          <div style={{ fontSize: 13, color: GRIJS }}>{t('teksten.uitleg')}</div>
          <div>
            <label style={label} htmlFor="mt-opm">{t('teksten.opmerking')}</label>
            <SpraakTextarea id="mt-opm" style={{ ...veld, minHeight: 88, resize: 'vertical' }}
              value={conceptOpmerking} onChange={setConceptOpmerking} />
          </div>
          <div>
            <label style={label} htmlFor="mt-afs">{t('teksten.afspraken')}</label>
            <SpraakTextarea id="mt-afs" style={{ ...veld, minHeight: 88, resize: 'vertical' }}
              value={conceptAfspraken} onChange={setConceptAfspraken} />
          </div>
          <button type="button" onClick={opslaan} disabled={bezig} style={{ ...primaireKnop, width: '100%' }}>
            {bezig ? t('nieuwPunt.opslaan') : t('teksten.knopOpslaan')}
          </button>
        </BottomSheet>
      )}
    </div>
  )
}

function Fout({ tekst }: { tekst: string }) {
  return (
    <div style={{ background: '#fdf1f0', border: '1px solid #f0c8c2', color: ROOD, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
      {tekst}
    </div>
  )
}
