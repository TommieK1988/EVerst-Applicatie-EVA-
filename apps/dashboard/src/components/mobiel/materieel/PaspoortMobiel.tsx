'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { legScanVast, zetOpMijnNaam } from '@/app/m/materieel/actions'
import { neemTerug, voegOnderhoudToe, wijsToe, zetStatus } from '@/app/(platform)/materieelbeheer/actions'
import { codeLabel, heeftSticker } from '@/lib/materieel/qr'
import {
  STATUS_META,
  type MaterieelCategorie, type MaterieelStatus, type Optie,
} from '@/lib/materieel/types'
import OptieKiezer from './OptieKiezer'
import { GRIJS, kaart, primaireKnop, RAND, ROOD, secundaireKnop, veld } from './stijl'

/**
 * Het paspoort zoals de buitendienst het op de telefoon ziet: wat is het, van
 * wie is het, en de drie dingen die je ter plekke doet — op je naam zetten,
 * inleveren, of een storing melden.
 *
 * Bewerken van de administratieve velden (waarde, leverancier, garantie) zit
 * hier bewust niet: dat is kantoorwerk en staat op de desktop.
 *
 * Uitgeven aan een cóllega staat er alleen voor wie 'beheren' heeft
 * (projectbureau, directie). Met alleen 'schrijven' kun je materieel op je eigen
 * naam zetten, inleveren en een storing melden — maar niet op andermans naam
 * schuiven; dan klopt "wie heeft wat" binnen een week niet meer. De server
 * bewaakt dat ook zelf, dit scherm laat de knop alleen niet zien.
 */
export default function PaspoortMobiel({
  object,
  fotoUrl,
  toegewezenNaam,
  mijnId,
  magSchrijven,
  magBeheren,
  medewerkers,
  teams,
  /** Kwam de gebruiker hier via een scan? Dan die scan vastleggen. */
  viaScan,
}: {
  object: {
    id: string
    omschrijving: string
    categorie: MaterieelCategorie
    merk: string | null
    type: string | null
    serienummer: string | null
    inventarisnummer: string | null
    qr_code: string | null
    status: MaterieelStatus
    toegewezen_medewerker_id: string | null
  }
  fotoUrl: string | null
  toegewezenNaam: string
  /** Id van de ingelogde medewerker — bepaalt of dit al op jouw naam staat. */
  mijnId: string
  magSchrijven: boolean
  /** 'beheren' — mag materieel aan een ander uitgeven. */
  magBeheren: boolean
  medewerkers: Optie[]
  teams: Optie[]
  viaScan: boolean
}) {
  const t = useTranslations('materieel')
  const router = useRouter()
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)
  const [melding, setMelding] = React.useState<string | null>(null)
  const [storingOpen, setStoringOpen] = React.useState(false)
  const [storingTekst, setStoringTekst] = React.useState('')
  // Waarde van de uitgifte-keuzelijst: 'algemeen', 'm:<id>' of 't:<id>' — één
  // lijst met collega's én bussen/werkplaatsen, want dat is dezelfde vraag: waar
  // ligt het. "Algemeen gebruik" hoort daar ook in: veel gereedschap ligt gewoon
  // in de werkplaats en hoort niemand toe, en zonder die keuze was de enige
  // manier om dat vast te leggen het eerst op je eigen naam zetten en daarna
  // weer inleveren.
  const [uitgifte, setUitgifte] = React.useState('')

  // Scan éénmalig vastleggen. Zonder deze markering vuurt het in
  // ontwikkelmodus twee keer (React draait effecten dan dubbel).
  const scanGelogd = React.useRef(false)
  React.useEffect(() => {
    if (!viaScan || !magSchrijven || scanGelogd.current) return
    scanGelogd.current = true
    legScanVast(object.id)
  }, [viaScan, magSchrijven, object.id])

  async function doe(actie: () => Promise<{ ok: boolean; error?: string }>, gelukt: string) {
    setBezig(true); setFout(null); setMelding(null)
    const res = await actie()
    if (res.ok) { setMelding(gelukt); router.refresh() } else setFout(res.error ?? t('fout.algemeen'))
    setBezig(false)
  }

  const status = STATUS_META[object.status]
  // Staat het al op mijn naam? Zo niet — ook als het van een collega is — kun je
  // het overnemen; dat gebeurt op de bouw nu eenmaal en de historie legt vast
  // wanneer het van wie naar wie ging.
  const isVanMij = object.toegewezen_medewerker_id === mijnId

  return (
    <div style={{ padding: 14 }}>
      {fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoUrl}
          alt=""
          style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 14, border: `1px solid ${RAND}`, marginBottom: 12 }}
        />
      )}

      <div style={kaart}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            color: status.kleur, background: `${status.kleur}1a`,
          }}>
            {t(`status.${object.status}`)}
          </span>
          <span style={{ fontSize: 12, color: GRIJS }}>{t(`categorie.${object.categorie}`)}</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>{object.omschrijving}</div>
        {(object.merk || object.type) && (
          <div style={{ fontSize: 14, color: GRIJS, marginTop: 2 }}>
            {[object.merk, object.type].filter(Boolean).join(' ')}
          </div>
        )}
      </div>

      <div style={kaart}>
        <Rij label={t('paspoort.van')} waarde={toegewezenNaam} />
        <Rij label={t('paspoort.serienummer')} waarde={object.serienummer ?? '—'} />
        <Rij label={t('paspoort.inventarisnummer')} waarde={object.inventarisnummer ?? '—'} />
        <Rij
          label={t('paspoort.sticker')}
          waarde={heeftSticker(object) ? codeLabel(object.qr_code) : t('paspoort.nogGeenSticker')}
          laatste
        />
      </div>

      {melding && (
        <div style={{ ...kaart, color: '#009439', fontSize: 14, fontWeight: 600 }}>{melding}</div>
      )}
      {fout && (
        <div style={{ ...kaart, color: ROOD, fontSize: 14, lineHeight: 1.45 }}>{fout}</div>
      )}

      {magSchrijven && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {!isVanMij ? (
            <button
              type="button" disabled={bezig}
              onClick={() => doe(() => zetOpMijnNaam(object.id), t('paspoort.opJouwNaamGezet'))}
              style={{ ...primaireKnop, opacity: bezig ? 0.6 : 1 }}
            >
              {t('paspoort.opMijnNaam')}
            </button>
          ) : (
            <button
              type="button" disabled={bezig}
              onClick={() => doe(() => neemTerug(object.id), t('paspoort.ingeleverd'))}
              style={{ ...secundaireKnop, opacity: bezig ? 0.6 : 1 }}
            >
              {t('paspoort.inleveren')}
            </button>
          )}

          {magBeheren && (medewerkers.length > 0 || teams.length > 0) && (
            <div style={kaart}>
              <div style={{ fontSize: 12, color: GRIJS, fontWeight: 600, marginBottom: 6 }}>
                {t('paspoort.waarHoortHet')}
              </div>
              <div style={{ marginBottom: 8 }}>
                <OptieKiezer
                  waarde={uitgifte}
                  onKies={setUitgifte}
                  vaste={{ id: 'algemeen', naam: t('algemeenGebruik') }}
                  groepen={[
                    ...(teams.length > 0 ? [{
                      label: t('kiezer.werkplaatsEnBussen'),
                      opties: teams.map((tm) => ({ id: `t:${tm.id}`, naam: tm.naam })),
                    }] : []),
                    ...(medewerkers.length > 0 ? [{
                      label: t('kiezer.collegas'),
                      opties: medewerkers.map((m) => ({ id: `m:${m.id}`, naam: m.naam })),
                    }] : []),
                  ]}
                  plaatshouder={t('paspoort.kiesPlaatshouder')}
                  zoekPlaatshouder={t('kiezer.typNaamOfWerkplaats')}
                />
              </div>
              <button
                type="button"
                disabled={bezig || uitgifte === ''}
                onClick={() => {
                  const [soort, id] = uitgifte.split(':')
                  // Algemeen gebruik is geen toewijzing maar het ontbreken ervan;
                  // `neemTerug` sluit de lopende uitgifte netjes af.
                  if (soort === 'algemeen') return doe(() => neemTerug(object.id), t('paspoort.opAlgemeenGezet'))
                  return doe(
                    () => wijsToe(object.id, soort === 't'
                      ? { niveau: 'team', team_id: id }
                      : { niveau: 'persoonlijk', medewerker_id: id },
                    ),
                    t('paspoort.uitgegeven'),
                  )
                }}
                style={{ ...primaireKnop, width: '100%', opacity: bezig || uitgifte === '' ? 0.5 : 1 }}
              >
                {t('paspoort.toewijzen')}
              </button>
            </div>
          )}

          {!storingOpen ? (
            <button type="button" onClick={() => setStoringOpen(true)} style={secundaireKnop}>
              {t('paspoort.storingMelden')}
            </button>
          ) : (
            <div style={kaart}>
              <textarea
                value={storingTekst}
                onChange={(e) => setStoringTekst(e.target.value)}
                rows={3}
                placeholder={t('paspoort.watIsErAanDeHand')}
                style={{ ...veld, resize: 'vertical', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button" onClick={() => { setStoringOpen(false); setStoringTekst('') }}
                  style={{ ...secundaireKnop, flex: 1 }}
                >
                  {t('paspoort.annuleren')}
                </button>
                <button
                  type="button"
                  disabled={bezig || storingTekst.trim().length === 0}
                  onClick={() => doe(async () => {
                    // Eerst de melding vastleggen, dan pas de status: andersom
                    // staat het object op defect zonder dat iemand weet waarom.
                    const res = await voegOnderhoudToe(object.id, {
                      type: 'storing', omschrijving: storingTekst, status: 'open',
                    })
                    if (!res.ok) return res
                    const st = await zetStatus(object.id, 'defect')
                    if (st.ok) { setStoringOpen(false); setStoringTekst('') }
                    return st
                  }, t('paspoort.storingGemeld'))}
                  style={{ ...primaireKnop, flex: 2, opacity: bezig || !storingTekst.trim() ? 0.6 : 1 }}
                >
                  {t('paspoort.melden')}
                </button>
              </div>
            </div>
          )}

          {!heeftSticker(object) && (
            <Link href={`/m/materieel/scan?koppelAan=${object.id}`} style={{ ...secundaireKnop, textAlign: 'center', textDecoration: 'none' }}>
              {t('paspoort.stickerKoppelen')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function Rij({ label, waarde, laatste }: { label: string; waarde: string; laatste?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '7px 0', borderBottom: laatste ? 'none' : `1px solid ${RAND}`,
    }}>
      <span style={{ fontSize: 13, color: GRIJS, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{waarde}</span>
    </div>
  )
}
