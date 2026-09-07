'use client'

/**
 * De mobiele doorloop van een projectbezoek.
 *
 * Eén scherm met secties in plaats van een stappenwizard: een projectleider loopt niet in een
 * vaste volgorde over een bouwplaats. Hij vinkt bovenaan aan wát hij doet, en daaronder klapt
 * per onderdeel open wat daarbij hoort.
 *
 * Alles wordt direct weggeschreven — zelfde afweging als bij de kwaliteitsronde: op een
 * bouwplaats met matig bereik mag een half uur werk niet aan één "opslaan" hangen.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  setBezoekOnderdeel, updateBezoek, voegBezoekPuntToe, uploadBezoekFoto,
  verwijderBezoekFoto, startKwaliteitVoorBezoek, rondBezoekAf,
} from '@/lib/bezoek/bezoeken'
import {
  BEZOEK_ONDERDELEN, bezoekOnderdeelLabels, bezoekOnderdeelUitleg,
  BEZOEK_ONDERDEEL_KOLOM, bezoekKenmerk, bezoekOnvolledig,
  type BezoekContext, type BezoekOnderdeel,
} from '@/lib/bezoek/types'
import {
  GRIJS, RAND, TEKST, OPPERVLAK, GROEN, ROOD, AMBER,
  veld, label, primaireKnop, secundaireKnop, kaart,
} from '@/components/mobiel/kwaliteit/stijl'

export default function BezoekDoorloop({ context }: { context: BezoekContext }) {
  const router = useRouter()
  const [bezig, startOvergang] = useTransition()
  const { bezoek, dossier, punten, fotos, kwaliteit } = context
  const definitief = bezoek.status === 'definitief'

  const ververs = () => router.refresh()

  async function doe<T>(fn: () => Promise<{ ok: true } | { ok: false; error: string } | T>) {
    const r = (await fn()) as { ok: boolean; error?: string }
    if (!r.ok) { toast.error(r.error ?? 'Er ging iets mis'); return false }
    startOvergang(ververs)
    return true
  }

  const aan = (o: BezoekOnderdeel) => bezoek[BEZOEK_ONDERDEEL_KOLOM[o]]

  return (
    <div style={{ padding: '12px 14px 90px', color: TEKST }}>
      {/* Kop */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: GRIJS, fontWeight: 600 }}>
          {bezoekKenmerk(bezoek.volgnummer)} · {dossier.dossiernummer ?? ''}
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, marginTop: 2 }}>
          {dossier.titel}
        </div>
        {dossier.werkadres && (
          <div style={{ fontSize: 13, color: GRIJS, marginTop: 2 }}>{dossier.werkadres}</div>
        )}
      </div>

      {definitief && (
        <div style={{
          ...kaart, borderColor: GROEN, background: 'rgba(0,148,57,0.06)', fontSize: 13.5,
        }}>
          Dit bezoek is afgerond. Er kan niets meer aan gewijzigd worden.
        </div>
      )}

      {/* ── Wat doe je vandaag ───────────────────────────────────────────── */}
      <SectieKop>Wat doe je tijdens dit bezoek?</SectieKop>
      <div style={{ marginBottom: 16 }}>
        {BEZOEK_ONDERDELEN.map(o => (
          <button
            key={o}
            type="button"
            disabled={definitief || bezig}
            onClick={() => doe(() => setBezoekOnderdeel(bezoek.id, o, !aan(o)))}
            style={{
              ...kaart,
              marginBottom: 8,
              display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%',
              textAlign: 'left', cursor: definitief ? 'default' : 'pointer',
              borderColor: aan(o) ? GROEN : RAND,
              background: aan(o) ? 'rgba(0,148,57,0.06)' : OPPERVLAK,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
              border: `2px solid ${aan(o) ? GROEN : RAND}`,
              background: aan(o) ? GROEN : 'transparent',
              color: '#fff', fontSize: 14, lineHeight: '19px', textAlign: 'center', fontWeight: 700,
            }}>{aan(o) ? '✓' : ''}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>
                {bezoekOnderdeelLabels[o]}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: GRIJS, marginTop: 2 }}>
                {bezoekOnderdeelUitleg[o]}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* ── Omstandigheden ───────────────────────────────────────────────── */}
      <SectieKop>Het bezoek</SectieKop>
      <div style={{ ...kaart, marginBottom: 16 }}>
        <TekstVeld
          titel="Weer" waarde={bezoek.weer ?? ''} lezen={definitief}
          plaatshouder="Droog, 18 °C"
          opslaan={v => doe(() => updateBezoek(bezoek.id, { weer: v }))}
        />
        <TekstVeld
          titel="Wat heb je bekeken" waarde={bezoek.locatie ?? ''} lezen={definitief}
          plaatshouder="Blok A, noord- en oostgevel"
          opslaan={v => doe(() => updateBezoek(bezoek.id, { locatie: v }))}
        />
        <TekstVeld
          titel="Werkzaamheden in uitvoering" waarde={bezoek.werkzaamheden ?? ''} lezen={definitief}
          plaatshouder="Schilderwerk en houtrotherstel"
          opslaan={v => doe(() => updateBezoek(bezoek.id, { werkzaamheden: v }))}
          laatste
        />
      </div>

      {/* ── Kwaliteit ────────────────────────────────────────────────────── */}
      {aan('kwaliteit') && (
        <>
          <SectieKop>Kwaliteit</SectieKop>
          <div style={{ ...kaart, marginBottom: 16 }}>
            {kwaliteit ? (
              <>
                <div style={{ fontSize: 14, marginBottom: 8 }}>
                  <strong>{kwaliteit.nummer}</strong> · {kwaliteit.beoordeeld} beoordeeld
                  {kwaliteit.afwijkend > 0 && (
                    <span style={{ color: ROOD, fontWeight: 600 }}> · {kwaliteit.afwijkend} afwijkend</span>
                  )}
                </div>
                <a href={`/m/kwaliteit/${kwaliteit.id}`} style={{ ...secundaireKnop, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  {kwaliteit.status === 'definitief' ? 'Ronde bekijken' : 'Verder met de ronde'}
                </a>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: GRIJS, margin: '0 0 10px' }}>
                  De kwaliteitsronde is een eigen doorloop met controlepunten en metingen. Je kiest
                  daar zelf welke disciplines je nu beoordeelt.
                </p>
                <button
                  type="button" disabled={definitief || bezig}
                  onClick={async () => {
                    const r = await startKwaliteitVoorBezoek(bezoek.id)
                    if (!r.ok) { toast.error(r.error); return }
                    router.push(`/m/kwaliteit/${r.id}`)
                  }}
                  style={{ ...primaireKnop, width: '100%' }}
                >
                  Kwaliteitsronde starten
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Veiligheid ───────────────────────────────────────────────────── */}
      {aan('veiligheid') && (
        <PuntenSectie
          titel="Veiligheid"
          uitleg="Onveilige situaties die je constateert. Ze komen als veiligheidspunt op het dossier te staan."
          soort="veiligheid"
          punten={punten.filter(p => p.soort === 'veiligheid')}
          bezoekId={bezoek.id}
          lezen={definitief}
          naOpslaan={ververs}
        />
      )}

      {/* ── Algemeen ─────────────────────────────────────────────────────── */}
      {aan('algemeen') && (
        <PuntenSectie
          titel="Algemeen"
          uitleg="Wat je verder opvalt. Dit wordt een aandachtspunt op het dossier, met opvolging."
          soort="oplever"
          punten={punten.filter(p => p.soort === 'oplever')}
          bezoekId={bezoek.id}
          lezen={definitief}
          naOpslaan={ververs}
        />
      )}

      {/* ── Voortgang ────────────────────────────────────────────────────── */}
      {aan('voortgang') && (
        <>
          <SectieKop>Voortgang</SectieKop>
          <div style={{ ...kaart, marginBottom: 16 }}>
            <TekstVeld
              titel="Hoe staat het ervoor" waarde={bezoek.voortgang_tekst ?? ''} lezen={definitief}
              plaatshouder="De noordgevel is af, de oostgevel is in de grondlaag. Op schema."
              regels={4}
              opslaan={v => doe(() => updateBezoek(bezoek.id, { voortgang_tekst: v }))}
              laatste
            />
            <FotoStrip
              bezoekId={bezoek.id} soort="voortgang" lezen={definitief}
              fotos={fotos.filter(f => f.soort === 'voortgang')}
              naWijziging={ververs}
            />
          </div>
        </>
      )}

      {/* ── Afronden ─────────────────────────────────────────────────────── */}
      <SectieKop>Afronden</SectieKop>
      <div style={{ ...kaart }}>
        <TekstVeld
          titel="Algemene opmerkingen" waarde={bezoek.algemene_opmerkingen ?? ''} lezen={definitief}
          plaatshouder="Optioneel" regels={3}
          opslaan={v => doe(() => updateBezoek(bezoek.id, { algemene_opmerkingen: v }))}
          laatste
        />

        {!definitief && (
          <>
            {bezoekOnvolledig(context).map(m => (
              <div key={m} style={{ fontSize: 12.5, color: AMBER, marginTop: 8 }}>• {m}</div>
            ))}
            <button
              type="button" disabled={bezig}
              onClick={async () => {
                if (await doe(() => rondBezoekAf(bezoek.id))) {
                  toast.success('Bezoek afgerond')
                }
              }}
              style={{ ...primaireKnop, width: '100%', marginTop: 12 }}
            >
              Bezoek afronden
            </button>
            <p style={{ fontSize: 11.5, color: GRIJS, margin: '8px 0 0', textAlign: 'center' }}>
              Daarna kan de rapportage worden opgesteld.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Onderdelen ──────────────────────────────── */

function SectieKop({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 12, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
      letterSpacing: 0.4, margin: '0 0 8px',
    }}>{children}</h2>
  )
}

/** Tekstveld dat bij verlaten opslaat — geen opslaanknop per veld op een telefoon. */
function TekstVeld({
  titel, waarde, opslaan, plaatshouder, regels = 1, lezen = false, laatste = false,
}: {
  titel: string
  waarde: string
  opslaan: (v: string) => void | Promise<unknown>
  plaatshouder?: string
  regels?: number
  lezen?: boolean
  laatste?: boolean
}) {
  const [lokaal, setLokaal] = useState(waarde)
  const gedeeld = {
    style: { ...veld, ...(regels > 1 ? { minHeight: regels * 26 } : {}) },
    value: lokaal,
    placeholder: plaatshouder,
    disabled: lezen,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLokaal(e.target.value),
    onBlur: () => { if (lokaal !== waarde) opslaan(lokaal) },
  }
  return (
    <div style={{ marginBottom: laatste ? 0 : 12 }}>
      <span style={label}>{titel}</span>
      {regels > 1 ? <textarea rows={regels} {...gedeeld} /> : <input type="text" {...gedeeld} />}
    </div>
  )
}

/**
 * Veiligheids- en aandachtspunten. Eén component voor allebei: het verschil is alleen `soort`,
 * en dat bepaalt in welk register het punt landt.
 */
function PuntenSectie({
  titel, uitleg, soort, punten, bezoekId, lezen, naOpslaan,
}: {
  titel: string
  uitleg: string
  soort: 'veiligheid' | 'oplever'
  punten: BezoekContext['punten']
  bezoekId: string
  lezen: boolean
  naOpslaan: () => void
}) {
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [bezig, setBezig] = useState(false)

  return (
    <>
      <SectieKop>{titel}</SectieKop>
      <div style={{ marginBottom: 16 }}>
        {punten.map(p => (
          <div key={p.id} style={{ ...kaart, marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: GRIJS, fontWeight: 600 }}>
              {soort === 'veiligheid' ? 'VP' : 'AP'}{String(p.volgnummer).padStart(2, '0')}
              {p.ruimte ? ` · ${p.ruimte}` : ''}
            </div>
            <div style={{ fontSize: 14.5, marginTop: 3 }}>{p.omschrijving}</div>
            {p.fotoUrls.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto' }}>
                {p.fotoUrls.map(u => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" style={{
                    width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0,
                  }} />
                ))}
              </div>
            )}
          </div>
        ))}

        {punten.length === 0 && (
          <p style={{ fontSize: 13, color: GRIJS, margin: '0 0 10px' }}>{uitleg}</p>
        )}

        {!lezen && (
          <div style={{ ...kaart }}>
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Wat is er aan de hand</span>
              <textarea
                rows={2} style={{ ...veld, minHeight: 56 }} value={omschrijving}
                placeholder={soort === 'veiligheid'
                  ? 'Steiger niet volledig voorzien van leuning'
                  : 'Kras op de voordeur van nummer 24'}
                onChange={e => setOmschrijving(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Waar</span>
              <input
                type="text" style={veld} value={ruimte} placeholder="Voorgevel, 2e verdieping"
                onChange={e => setRuimte(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={bezig || !omschrijving.trim()}
              onClick={async () => {
                setBezig(true)
                const r = await voegBezoekPuntToe(bezoekId, {
                  omschrijving, ruimte: ruimte || null, soort,
                })
                setBezig(false)
                if (!r.ok) { toast.error(r.error); return }
                setOmschrijving(''); setRuimte('')
                naOpslaan()
              }}
              style={{
                ...primaireKnop, width: '100%',
                opacity: omschrijving.trim() ? 1 : 0.5,
              }}
            >
              Punt toevoegen
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** Foto's bij het bezoek zelf (voortgang). */
function FotoStrip({
  bezoekId, soort, fotos, lezen, naWijziging,
}: {
  bezoekId: string
  soort: 'voortgang' | 'algemeen'
  fotos: BezoekContext['fotos']
  lezen: boolean
  naWijziging: () => void
}) {
  const [bezig, setBezig] = useState(false)

  return (
    <div style={{ marginTop: 12 }}>
      <span style={label}>Foto&apos;s</span>
      {fotos.length > 0 && (
        // flexShrink 0 op de tegels: zonder dat perst een strook met overflow-x zichzelf plat.
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 10 }} />
              {!lezen && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await verwijderBezoekFoto(f.id)
                    if (!r.ok) { toast.error(r.error); return }
                    naWijziging()
                  }}
                  style={{
                    position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
                    border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14,
                    lineHeight: '24px', cursor: 'pointer', padding: 0,
                  }}
                  aria-label="Foto verwijderen"
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {!lezen && (
        <label style={{ ...secundaireKnop, display: 'block', textAlign: 'center' }}>
          {bezig ? 'Bezig…' : 'Foto toevoegen'}
          <input
            type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              setBezig(true)
              const fd = new FormData()
              fd.set('foto', file)
              fd.set('soort', soort)
              const r = await uploadBezoekFoto(bezoekId, fd)
              setBezig(false)
              e.target.value = ''
              if (!r.ok) { toast.error(r.error); return }
              naWijziging()
            }}
          />
        </label>
      )}
    </div>
  )
}
