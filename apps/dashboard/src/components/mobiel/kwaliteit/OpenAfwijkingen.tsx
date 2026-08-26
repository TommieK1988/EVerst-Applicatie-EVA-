'use client'

import React from 'react'
import type { KwaliteitAfwijking } from '@everts/database/kwaliteit-types'
import { kwaliteitAfwijkingStatusLabels, kwaliteitErnstLabels } from '@everts/database/kwaliteit-types'
import { registreerHercontrole } from '@/lib/kwaliteit/afwijkingen'
import { HERCONTROLE_LABELS, HERCONTROLE_VRAAGT_FOTO, type HercontroleUitkomst } from '@/lib/kwaliteit/regels'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import FotoStrook, { type StrookFoto } from './FotoStrook'
import { ERNST_KLEUR, GRIJS, GROEN, kaart, primaireKnop, RAND, ROOD, secundaireKnop, TEKST, ZACHT } from './stijl'

/**
 * Stap 2: openstaande afwijkingen uit eerdere rondes hercontroleren (§38).
 *
 * Staat vóór de nieuwe controlepunten, want dit is waar de opzichter als eerste langs loopt: is
 * wat vorige keer is afgekeurd inmiddels hersteld?
 *
 * "Niet gecontroleerd" laat de afwijking bewust ongemoeid — dat de opzichter er deze ronde niet aan
 * toe kwam is geen statuswijziging en hoort niet in de historie.
 */
export default function OpenAfwijkingen({
  inspectieId,
  afwijkingen,
  bewerkbaar,
  onGewijzigd,
  onTerug,
  onVerder,
}: {
  inspectieId: string
  afwijkingen: (KwaliteitAfwijking & { fotoUrls: string[] })[]
  bewerkbaar: boolean
  onGewijzigd: () => void
  onTerug: () => void
  onVerder: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '16px 14px 0', flex: 1 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: TEKST }}>
          Openstaande afwijkingen
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: GRIJS, lineHeight: 1.4 }}>
          Uit eerdere inspecties op dit project. Loop ze na voordat je aan de nieuwe controlepunten
          begint.
        </p>

        {afwijkingen.length === 0 && (
          <p style={{ fontSize: 13, color: ZACHT, textAlign: 'center', padding: '24px 0' }}>
            Geen openstaande afwijkingen.
          </p>
        )}

        {afwijkingen.map(a => (
          <HercontroleKaart
            key={a.id}
            afwijking={a}
            inspectieId={inspectieId}
            bewerkbaar={bewerkbaar}
            onGewijzigd={onGewijzigd}
          />
        ))}
      </div>

      <MobielStickyFooter>
        <button type="button" onClick={onTerug} style={{ ...secundaireKnop, flex: '0 0 auto' }}>Terug</button>
        <button type="button" onClick={onVerder} style={{ ...primaireKnop, flex: 1 }}>Naar de controlepunten</button>
      </MobielStickyFooter>
    </div>
  )
}

function HercontroleKaart({
  afwijking, inspectieId, bewerkbaar, onGewijzigd,
}: {
  afwijking: KwaliteitAfwijking & { fotoUrls: string[] }
  inspectieId: string
  bewerkbaar: boolean
  onGewijzigd: () => void
}) {
  const [keuze, setKeuze] = React.useState<HercontroleUitkomst | null>(null)
  const [opmerking, setOpmerking] = React.useState('')
  const [herstelFotos, setHerstelFotos] = React.useState<StrookFoto[]>([])
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)
  const [klaar, setKlaar] = React.useState(false)

  // Bewijs van herstel is bij een kritieke afwijking verplicht: die ging over veiligheid of
  // waterdichtheid en "het is gemaakt" op iemands woord is dan te mager.
  const fotoVerplicht = keuze === 'hersteld' && afwijking.ernst === 'kritiek'

  async function bevestig() {
    if (!keuze) return
    if (fotoVerplicht && herstelFotos.length === 0) {
      setFout('Voeg een foto van het herstel toe; deze afwijking was kritiek.')
      return
    }
    setBezig(true); setFout(null)
    const res = await registreerHercontrole(afwijking.id, inspectieId, keuze, opmerking || undefined)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setKlaar(true)
    onGewijzigd()
  }

  return (
    <div style={{ ...kaart, borderLeft: `4px solid ${ERNST_KLEUR[afwijking.ernst]}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: ZACHT }}>{afwijking.afwijkingsnummer}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: ERNST_KLEUR[afwijking.ernst] }}>
          {kwaliteitErnstLabels[afwijking.ernst].toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: ZACHT }}>
          {kwaliteitAfwijkingStatusLabels[afwijking.status]}
        </span>
      </div>

      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: TEKST, lineHeight: 1.35 }}>
        {afwijking.omschrijving ?? afwijking.controlepunt_code}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: GRIJS }}>
        {afwijking.locatie ?? '—'} · geconstateerd{' '}
        {new Date(afwijking.datum_constatering).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>

      {afwijking.fotoUrls.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 4 }}>
          {afwijking.fotoUrls.map(url => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" style={{
              width: 60, height: 60, objectFit: 'cover', borderRadius: 8,
              border: `1px solid ${RAND}`, flexShrink: 0,
            }} />
          ))}
        </div>
      )}

      {klaar ? (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GROEN }}>
          ✓ Vastgelegd: {HERCONTROLE_LABELS[keuze!]}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: keuze ? 10 : 0 }}>
            {(Object.keys(HERCONTROLE_LABELS) as HercontroleUitkomst[]).map(u => {
              const actief = keuze === u
              return (
                <button
                  key={u}
                  type="button"
                  disabled={!bewerkbaar}
                  onClick={() => setKeuze(actief ? null : u)}
                  style={{
                    padding: '9px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                    border: `1.5px solid ${actief ? (u === 'hersteld' ? GROEN : ROOD) : RAND}`,
                    background: actief ? (u === 'hersteld' ? GROEN : ROOD) : 'transparent',
                    color: actief ? '#fff' : GRIJS, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', minHeight: 40,
                  }}
                >
                  {HERCONTROLE_LABELS[u]}
                </button>
              )
            })}
          </div>

          {keuze && keuze !== 'niet_gecontroleerd' && (
            <div style={{ marginTop: 4 }}>
              <input
                value={opmerking}
                onChange={e => setOpmerking(e.target.value)}
                placeholder="Toelichting (optioneel)"
                style={{
                  width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 16,
                  border: `1px solid ${RAND}`, background: 'var(--bg)', color: TEKST,
                  boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit',
                }}
              />
              {HERCONTROLE_VRAAGT_FOTO.includes(keuze) && (
                <div style={{ marginBottom: 10 }}>
                  <FotoStrook
                    koppelSoort="afwijking"
                    koppelId={afwijking.id}
                    soort="herstel"
                    fotos={herstelFotos}
                    onVeranderd={setHerstelFotos}
                    verplicht={fotoVerplicht}
                    compact
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => void bevestig()}
                disabled={bezig || !bewerkbaar}
                style={{ ...primaireKnop, width: '100%', padding: '11px 14px', fontSize: 14 }}
              >
                {bezig ? 'Bezig…' : 'Vastleggen'}
              </button>
            </div>
          )}
        </>
      )}

      {fout && <p style={{ margin: '8px 0 0', fontSize: 12, color: ROOD }}>{fout}</p>}
    </div>
  )
}
