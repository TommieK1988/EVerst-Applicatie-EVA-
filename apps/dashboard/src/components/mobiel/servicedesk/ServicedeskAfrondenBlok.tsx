'use client'

/**
 * "Bon afronden" op de Info-tab van een servicedeskbon (mobiel).
 *
 * Drie dingen die de monteur op locatie doet, in deze volgorde op het scherm:
 *  1. Gebruikt materiaal vastleggen — een foto van de pakbon, of getypt wat hij uit de bus pakte.
 *     De projectleider weet dan welke kosten en inkoopfacturen er nog komen, lang voordat die in
 *     Bouw7 binnen zijn. Kan op elk moment, niet pas bij het afronden: de pakbon krijg je bij de
 *     groothandel, vaak dagen voor het werk klaar is. Daarom staat dit bovenaan.
 *  2. De bon gereed melden, met wat er gedaan is en eventueel een handtekening voor akkoord van wie er ter plekke is.
 *  3. Een opmerking voor kantoor, met foto's. Komt in de Notities van de bon en de projectleider
 *     krijgt er een melding van.
 *
 * Data komt als props van de server (`ServicedeskAfrondenView`); na elke actie een
 * `router.refresh()` in plaats van eigen client-state, zodat het scherm altijd de database volgt.
 */

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import BottomSheet from '@/components/mobiel/BottomSheet'
import { useDialogen } from '@/components/ui'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import HandtekeningPad from '@/components/planning/werkbon/HandtekeningPad'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import {
  meldServicedeskGereed, voegPakbonToe, voegMateriaalToe, verwijderPakbon,
} from '@/lib/dossiers/servicedesk-afronden'
import { plaatsNotitieMetFotos, type DossierNotitie } from '@/lib/dossiers/notities-actions'
import type { ServicedeskAfronding } from '@/lib/dossiers/servicedesk-afronden-types'
import {
  GRIJS, GROEN, OPPERVLAK, RAND, TEKST, VLAK, label, primaireKnop, secundaireKnop, veld,
} from '@/components/mobiel/oplevering/stijl'

const fmtMoment = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  })

const kaart: React.CSSProperties = {
  background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
  padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
}

const kop: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: TEKST }

export default function ServicedeskAfrondenBlok({ dossierId, afronding, notities, magBewerken }: {
  dossierId: string
  afronding: ServicedeskAfronding
  /** De laatste notities van de bon, zodat je ziet wat er al naar kantoor ging. */
  notities: DossierNotitie[]
  /** Onwaar op een afgesloten bon: dan alleen lezen. */
  magBewerken: boolean
}) {
  const t = useTranslations('servicedesk')
  const locale = useDatumLocale()
  const [gereedOpen, setGereedOpen] = useState(false)
  const { gereedmelding } = afronding

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <GebruiktMateriaalKaart dossierId={dossierId} afronding={afronding} magBewerken={magBewerken} />

      <div style={kaart}>
        <div style={kop}>{t('bonGereedMelden')}</div>

        {gereedmelding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: GROEN }}>
              {gereedmelding.gemeldDoorNaam
                ? t('gereedGemeldDoor', { naam: gereedmelding.gemeldDoorNaam, moment: fmtMoment(gereedmelding.gemeldOp, locale) })
                : t('gereedGemeld', { moment: fmtMoment(gereedmelding.gemeldOp, locale) })}
            </div>
            <div style={{
              fontSize: 15, color: TEKST, whiteSpace: 'pre-wrap', lineHeight: 1.45,
              background: VLAK, borderRadius: 10, padding: '10px 12px',
            }}>
              {gereedmelding.uitgevoerdeWerkzaamheden}
            </div>
            {gereedmelding.handtekeningUrl && (
              <div>
                <div style={label}>
                  {gereedmelding.getekendDoor ? t('afgetekendDoor', { naam: gereedmelding.getekendDoor }) : t('afgetekend')}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gereedmelding.handtekeningUrl} alt={t('handtekening')}
                  style={{ width: '100%', maxHeight: 140, objectFit: 'contain', background: '#fafafa', border: `1px solid ${RAND}`, borderRadius: 10 }}
                />
              </div>
            )}
            {magBewerken && (
              <button type="button" onClick={() => setGereedOpen(true)} style={secundaireKnop}>
                {t('opnieuwGereed')}
              </button>
            )}
          </div>
        ) : magBewerken ? (
          <>
            <div style={{ fontSize: 14, color: GRIJS, lineHeight: 1.45 }}>
              {t('klaarUitleg')}
            </div>
            <button type="button" onClick={() => setGereedOpen(true)} style={primaireKnop}>
              {t('bonGereedMelden')}
            </button>
          </>
        ) : (
          <div style={{ fontSize: 14, color: GRIJS }}>{t('nietGereed')}</div>
        )}
      </div>

      <OpmerkingKantoorKaart dossierId={dossierId} notities={notities} magBewerken={magBewerken} />

      {gereedOpen && (
        <GereedSheet dossierId={dossierId} onSluit={() => setGereedOpen(false)} />
      )}
    </div>
  )
}

function GereedSheet({ dossierId, onSluit }: { dossierId: string; onSluit: () => void }) {
  const router = useRouter()
  const [werkzaamheden, setWerkzaamheden] = useState('')
  const [handtekening, setHandtekening] = useState<string | null>(null)
  const [getekendDoor, setGetekendDoor] = useState('')
  const [bezig, setBezig] = useState(false)
  const t = useTranslations('servicedesk')

  const kanVersturen = werkzaamheden.trim().length > 0 && !bezig

  async function verstuur() {
    if (!kanVersturen) return
    setBezig(true)
    const res = await meldServicedeskGereed(dossierId, {
      uitgevoerdeWerkzaamheden: werkzaamheden,
      handtekeningB64: handtekening,
      getekendDoor: getekendDoor || null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    if (res.waarschuwing) toast(res.waarschuwing, { icon: '⚠️', duration: 6000 })
    else toast.success(t('gereedToast'))
    onSluit()
    router.refresh()
  }

  return (
    <BottomSheet titel={t('bonGereedMelden')} onSluit={onSluit}>
      <div>
        <label htmlFor="sd-werkzaamheden" style={label}>{t('uitgevoerdeWerkzaamheden')}</label>
        <SpraakTextarea
          id="sd-werkzaamheden"
          value={werkzaamheden}
          onChange={setWerkzaamheden}
          placeholder={t('werkzaamhedenPlaceholder')}
          rows={5}
          style={{ ...veld, resize: 'vertical' }}
        />
      </div>

      <div>
        <div style={label}>{t('handtekeningOptioneel')}</div>
        <HandtekeningPad onChange={setHandtekening} hoogte={180} />
      </div>

      {handtekening && (
        <div>
          <label htmlFor="sd-getekend-door" style={label}>{t('naamOndertekenaar')}</label>
          <input
            id="sd-getekend-door"
            value={getekendDoor}
            onChange={e => setGetekendDoor(e.target.value)}
            placeholder={t('wieTekent')}
            autoComplete="off"
            style={veld}
          />
        </div>
      )}

      <button
        type="button" onClick={verstuur} disabled={!kanVersturen}
        style={{ ...primaireKnop, opacity: kanVersturen ? 1 : 0.5 }}
      >
        {bezig ? t('bezig') : t('gereedMelden')}
      </button>
    </BottomSheet>
  )
}

const verwijderKnop: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 999, border: 'none', background: 'rgba(22,27,32,0.65)',
  color: '#fff', fontSize: 16, lineHeight: '28px', padding: 0, cursor: 'pointer', flexShrink: 0,
}

function GebruiktMateriaalKaart({ dossierId, afronding, magBewerken }: {
  dossierId: string
  afronding: ServicedeskAfronding
  magBewerken: boolean
}) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)
  const [uploaden, setUploaden] = useState(false)
  const t = useTranslations('servicedesk')
  const locale = useDatumLocale()
  const { pakbonnen } = afronding
  const getypt = pakbonnen.filter(p => !p.fotoUrl)
  const fotos = pakbonnen.filter(p => !!p.fotoUrl)

  async function voegToe() {
    const materiaal = tekst.trim()
    if (!materiaal || bezig) return
    setBezig(true)
    const res = await voegMateriaalToe(dossierId, materiaal)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setTekst('')
    router.refresh()
  }

  // Geen leverancier-veld meer: die staat al op de foto van de pakbon.
  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploaden(true)
    let gelukt = 0
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('foto', await verkleinFoto(file))
      const res = await voegPakbonToe(dossierId, fd)
      if (res.ok) gelukt++
      else toast.error(res.error)
    }
    setUploaden(false)
    if (gelukt > 0) {
      toast.success(t('pakbonnenToegevoegd', { aantal: gelukt }))
      router.refresh()
    }
  }

  async function verwijder(id: string, wat: 'regel' | 'pakbon') {
    if (!await bevestig({ titel: t(`verwijderVraag.${wat}`), bevestigLabel: t('verwijderen'), destructief: true })) return
    const res = await verwijderPakbon(id)
    if (!res.ok) { toast.error(res.error); return }
    router.refresh()
  }

  return (
    <div style={kaart}>
      <div>
        <div style={kop}>{pakbonnen.length > 0 ? t('gebruiktMateriaalAantal', { aantal: pakbonnen.length }) : t('gebruiktMateriaal')}</div>
        <div style={{ fontSize: 13, color: GRIJS, marginTop: 2, lineHeight: 1.4 }}>
          {t('materiaalUitleg')}
        </div>
      </div>

      {getypt.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {getypt.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: VLAK, borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: TEKST, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>
                  {p.opmerking}
                </div>
                <div style={{ fontSize: 11, color: GRIJS, marginTop: 2 }}>
                  {p.geuploadDoorNaam ? `${p.geuploadDoorNaam} · ` : ''}{fmtMoment(p.geuploadOp, locale)}
                </div>
              </div>
              {magBewerken && p.isEigen && (
                <button type="button" onClick={() => verwijder(p.id, 'regel')} aria-label={t('regelVerwijderen')} style={verwijderKnop}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {fotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {fotos.map(p => (
            <div key={p.id} style={{ position: 'relative', minWidth: 0 }}>
              <a href={p.fotoUrl ?? undefined} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.fotoUrl ?? undefined} alt={p.opmerking ?? t('pakbon')}
                  style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 8, border: `1px solid ${RAND}`, display: 'block' }}
                />
              </a>
              {magBewerken && p.isEigen && (
                <button
                  type="button" onClick={() => verwijder(p.id, 'pakbon')} aria-label={t('pakbonVerwijderen')}
                  style={{ ...verwijderKnop, position: 'absolute', top: 4, right: 4 }}
                >
                  ×
                </button>
              )}
              <div style={{ fontSize: 11, color: GRIJS, marginTop: 4, lineHeight: 1.3, wordBreak: 'break-word' }}>
                {p.opmerking ? <strong style={{ color: TEKST, fontWeight: 600 }}>{p.opmerking}<br /></strong> : null}
                {fmtMoment(p.geuploadOp, locale)}
              </div>
            </div>
          ))}
        </div>
      )}

      {magBewerken && (
        <>
          <div>
            <label htmlFor="sd-materiaal" style={label}>{t('materiaal')}</label>
            <SpraakTextarea
              id="sd-materiaal"
              value={tekst}
              onChange={setTekst}
              placeholder={t('materiaalPlaceholder')}
              rows={2}
              style={{ ...veld, resize: 'vertical' }}
            />
          </div>
          <button
            type="button" onClick={voegToe} disabled={!tekst.trim() || bezig}
            style={{ ...secundaireKnop, opacity: tekst.trim() && !bezig ? 1 : 0.5 }}
          >
            {bezig ? t('bezig') : t('toevoegen')}
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { upload(e.target.files); e.target.value = '' }} />
          <input ref={galerijRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { upload(e.target.files); e.target.value = '' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button" disabled={uploaden} onClick={() => cameraRef.current?.click()}
              style={{ ...primaireKnop, flex: 1, fontSize: 15, opacity: uploaden ? 0.6 : 1 }}
            >
              {uploaden ? t('uploaden') : t('pakbonFotograferen')}
            </button>
            <button
              type="button" disabled={uploaden} onClick={() => galerijRef.current?.click()}
              style={{ ...secundaireKnop, fontSize: 14 }}
            >
              {t('galerij')}
            </button>
          </div>
        </>
      )}

      {!magBewerken && pakbonnen.length === 0 && (
        <div style={{ fontSize: 14, color: GRIJS }}>{t('geenMateriaal')}</div>
      )}
    </div>
  )
}

const MAX_OPMERKING_FOTOS = 6

/**
 * Opmerking voor kantoor: tekst plus foto's, naar de Notities van de bon, met een melding aan
 * de projectleider. De foto's worden hier al verkleind en pas bij Versturen in één keer
 * meegestuurd — zo ontstaat er nooit een notitie met half-geüploade foto's.
 */
function OpmerkingKantoorKaart({ dossierId, notities, magBewerken }: {
  dossierId: string
  notities: DossierNotitie[]
  magBewerken: boolean
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)
  const [tekst, setTekst] = useState('')
  const [fotos, setFotos] = useState<{ file: File; url: string }[]>([])
  const [bezig, setBezig] = useState(false)
  const t = useTranslations('servicedesk')
  const locale = useDatumLocale()

  async function kies(files: FileList | null) {
    if (!files || files.length === 0) return
    const ruimte = Math.max(0, MAX_OPMERKING_FOTOS - fotos.length)
    const lijst = Array.from(files).slice(0, ruimte)
    if (files.length > lijst.length) toast.error(t('maxFotos', { max: MAX_OPMERKING_FOTOS }))
    const nieuw = await Promise.all(lijst.map(async f => {
      const file = await verkleinFoto(f)
      return { file, url: URL.createObjectURL(file) }
    }))
    setFotos(prev => [...prev, ...nieuw])
  }

  function haalWeg(url: string) {
    URL.revokeObjectURL(url)
    setFotos(prev => prev.filter(f => f.url !== url))
  }

  async function verstuur() {
    if (!tekst.trim() || bezig) return
    setBezig(true)
    const fd = new FormData()
    fd.append('inhoud', tekst.trim())
    for (const f of fotos) fd.append('foto', f.file)
    const res = await plaatsNotitieMetFotos(dossierId, fd)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    fotos.forEach(f => URL.revokeObjectURL(f.url))
    setFotos([])
    setTekst('')
    toast.success(t('opmerkingVerstuurd'))
    router.refresh()
  }

  const recent = notities.slice(0, 5)

  return (
    <div style={kaart}>
      <div>
        <div style={kop}>{t('opmerkingKantoor')}</div>
        <div style={{ fontSize: 13, color: GRIJS, marginTop: 2, lineHeight: 1.4 }}>
          {t('opmerkingUitleg')}
        </div>
      </div>

      {magBewerken && (
        <>
          <SpraakTextarea
            id="sd-opmerking-kantoor"
            value={tekst}
            onChange={setTekst}
            placeholder={t('opmerkingPlaceholder')}
            rows={3}
            style={{ ...veld, resize: 'vertical' }}
          />

          {fotos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {fotos.map((f, i) => (
                <div key={f.url} style={{ position: 'relative', minWidth: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={t('fotoNummer', { nummer: i + 1 })}
                    style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${RAND}`, display: 'block' }} />
                  <button
                    type="button" onClick={() => haalWeg(f.url)} aria-label={t('fotoWeghalen')}
                    style={{ ...verwijderKnop, position: 'absolute', top: 4, right: 4 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { kies(e.target.files); e.target.value = '' }} />
          <input ref={galerijRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { kies(e.target.files); e.target.value = '' }} />
          {fotos.length < MAX_OPMERKING_FOTOS && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={bezig} onClick={() => cameraRef.current?.click()}
                style={{ ...secundaireKnop, flex: 1, fontSize: 14 }}>
                {t('fotoMaken')}
              </button>
              <button type="button" disabled={bezig} onClick={() => galerijRef.current?.click()}
                style={{ ...secundaireKnop, fontSize: 14 }}>
                {t('galerij')}
              </button>
            </div>
          )}

          <button
            type="button" onClick={verstuur} disabled={!tekst.trim() || bezig}
            style={{ ...primaireKnop, opacity: tekst.trim() && !bezig ? 1 : 0.5 }}
          >
            {bezig ? t('versturenBezig') : t('versturen')}
          </button>
        </>
      )}

      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${RAND}`, paddingTop: 12 }}>
          <div style={label}>{t('laatsteNotities')}</div>
          {recent.map(n => (
            <div key={n.id}>
              <div style={{ fontSize: 11, color: GRIJS, marginBottom: 2 }}>
                {n.auteur_naam} · {fmtMoment(n.created_at, locale)}
              </div>
              {/* Notities komen vaak van kantoor: vertalen, met de weg terug naar het origineel. */}
              <VertaalbareTekst
                tekst={n.inhoud} as="div"
                style={{ fontSize: 14, color: TEKST, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}
              />
              {n.foto_urls.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {n.foto_urls.map(u => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={t('fotoBijNotitie')}
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: `1px solid ${RAND}`, display: 'block' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
