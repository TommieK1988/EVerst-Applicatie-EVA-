'use client'

/**
 * De mobiele doorloop van een projectbezoek.
 *
 * Eén scherm met secties in plaats van een stappenwizard: een projectleider loopt niet in een
 * vaste volgorde over een bouwplaats. Bovenaan kiest hij de disciplines die worden uitgevoerd,
 * en daaronder krijgt elk gekozen vak zijn eigen blok: wat valt op, met foto, en hoe ver is het.
 *
 * Alles wordt direct weggeschreven — zelfde afweging als bij de kwaliteitsronde: op een
 * bouwplaats met matig bereik mag een half uur werk niet aan één "opslaan" hangen.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  zetBezoekDisciplines, zetVoortgang, updateBezoek, voegPuntToe, updatePunt,
  verwijderPunt, uploadBezoekFoto, verwijderBezoekFoto, rondBezoekAf,
} from '@/lib/bezoek/bezoeken'
import {
  bezoekKenmerk, puntKenmerk, bezoekOnvolledig,
  type BezoekContext, type BezoekDiscipline, type BezoekPunt,
} from '@/lib/bezoek/types'
import {
  GRIJS, RAND, TEKST, OPPERVLAK, GROEN, AMBER,
  veld, label, primaireKnop, kaart,
} from '@/components/mobiel/kwaliteit/stijl'
import DisciplineKiezer from './DisciplineKiezer'
import { SectieKop, TekstVeld, FotoStrip } from './velden'

export default function BezoekDoorloop({ context }: { context: BezoekContext }) {
  const router = useRouter()
  const [bezig, startOvergang] = useTransition()
  const { bezoek, dossier, disciplines, punten, fotos, beschikbareDisciplines } = context
  const definitief = bezoek.status === 'definitief'

  const ververs = () => router.refresh()

  async function doe<T>(fn: () => Promise<{ ok: true } | { ok: false; error: string } | T>) {
    const r = (await fn()) as { ok: boolean; error?: string }
    if (!r.ok) { toast.error(r.error ?? 'Er ging iets mis'); return false }
    startOvergang(ververs)
    return true
  }

  // Een discipline waar punten onder hangen mag niet zomaar uit de keuze verdwijnen; de
  // kiezer vergrendelt hem zodat de gebruiker dat ziet vóór hij tikt.
  const metPunten = new Set(punten.map(p => p.discipline_code))

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

      {/* ── Disciplines ──────────────────────────────────────────────────── */}
      <SectieKop>Welke disciplines worden uitgevoerd?</SectieKop>
      <div style={{ marginBottom: 16 }}>
        <DisciplineKiezer
          beschikbaar={beschikbareDisciplines}
          gekozen={disciplines.map(d => d.code)}
          lezen={definitief}
          metPunten={metPunten}
          opslaan={async codes => {
            const r = await zetBezoekDisciplines(bezoek.id, codes)
            if (!r.ok) { toast.error(r.error); return r }
            startOvergang(ververs)
            return r
          }}
        />
        {disciplines.length === 0 && (
          <p style={{ fontSize: 12.5, color: GRIJS, margin: '8px 0 0' }}>
            De keuze van het vorige bezoek staat voor je klaar zodra je er één hebt gedaan.
          </p>
        )}
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

      {/* ── Per discipline ───────────────────────────────────────────────── */}
      {disciplines.map(d => (
        <DisciplineBlok
          key={d.code}
          discipline={d}
          bezoekId={bezoek.id}
          punten={punten.filter(p => p.discipline_code === d.code)}
          lezen={definitief}
          naWijziging={ververs}
        />
      ))}

      {/* ── Voortgang ────────────────────────────────────────────────────── */}
      {disciplines.length > 0 && (
        <>
          <SectieKop>Voortgang per discipline</SectieKop>
          <div style={{ ...kaart, marginBottom: 16 }}>
            {disciplines.map((d, i) => (
              <VoortgangRegel
                key={d.code}
                discipline={d}
                lezen={definitief}
                laatste={i === disciplines.length - 1}
                opslaan={pct => doe(() => zetVoortgang(bezoek.id, d.code, pct))}
              />
            ))}
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
        <FotoStrip
          titel="Overzichtsfoto's van dit bezoek"
          fotos={fotos}
          lezen={definitief}
          uploaden={async file => {
            const fd = new FormData()
            fd.set('foto', file)
            return uploadBezoekFoto(bezoek.id, fd)
          }}
          verwijderen={id => verwijderBezoekFoto(id)}
          naWijziging={ververs}
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

/**
 * Eén discipline: de punten die eronder hangen, plus het invulblok om er een bij te doen.
 *
 * Inklapbaar, standaard open. Bij vijf disciplines scheelt dat veel scrollen.
 */
function DisciplineBlok({
  discipline, bezoekId, punten, lezen, naWijziging,
}: {
  discipline: BezoekDiscipline
  bezoekId: string
  punten: BezoekPunt[]
  lezen: boolean
  naWijziging: () => void
}) {
  const [open, setOpen] = useState(true)
  const [tekst, setTekst] = useState('')
  const [alsAandachtspunt, setAlsAandachtspunt] = useState(false)
  const [bezig, setBezig] = useState(false)

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: 0, border: 'none', background: 'none', textAlign: 'left',
          fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: GRIJS,
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {discipline.naam}
          {punten.length > 0 && (
            <span style={{ textTransform: 'none', letterSpacing: 0 }}> · {punten.length}</span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GRIJS}
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {punten.map(p => (
            <PuntKaart
              key={p.id} punt={p} bezoekId={bezoekId} lezen={lezen} naWijziging={naWijziging}
            />
          ))}

          {!lezen && (
            <div style={{ ...kaart }}>
              <div style={{ marginBottom: 10 }}>
                <span style={label}>Wat valt je op?</span>
                <textarea
                  rows={2} style={{ ...veld, minHeight: 56 }} value={tekst}
                  placeholder="Kras op de voordeur van nummer 24"
                  onChange={e => setTekst(e.target.value)}
                />
              </div>
              <AandachtspuntVinkje
                aan={alsAandachtspunt}
                lezen={false}
                onWissel={() => setAlsAandachtspunt(v => !v)}
              />
              <button
                type="button"
                disabled={bezig || !tekst.trim()}
                onClick={async () => {
                  setBezig(true)
                  const r = await voegPuntToe(bezoekId, {
                    discipline_code: discipline.code,
                    tekst,
                    is_aandachtspunt: alsAandachtspunt,
                  })
                  setBezig(false)
                  if (!r.ok) { toast.error(r.error); return }
                  setTekst(''); setAlsAandachtspunt(false)
                  naWijziging()
                }}
                style={{
                  ...primaireKnop, width: '100%', marginTop: 10,
                  opacity: tekst.trim() ? 1 : 0.5,
                }}
              >
                Punt toevoegen
              </button>
            </div>
          )}

          {lezen && punten.length === 0 && (
            <p style={{ fontSize: 13, color: GRIJS, margin: '0 0 10px' }}>
              Geen bijzonderheden vastgelegd.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Eén vastgelegd punt: tekst, foto's en het aandachtspunt-vinkje. */
function PuntKaart({
  punt, bezoekId, lezen, naWijziging,
}: {
  punt: BezoekPunt
  bezoekId: string
  lezen: boolean
  naWijziging: () => void
}) {
  const [bezig, setBezig] = useState(false)

  return (
    <div style={{ ...kaart }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: GRIJS, fontWeight: 600 }}>
            {puntKenmerk(punt.volgnummer)}
          </div>
          <div style={{ fontSize: 14.5, marginTop: 3 }}>{punt.tekst}</div>
        </div>
        {!lezen && (
          <button
            type="button"
            disabled={bezig}
            onClick={async () => {
              setBezig(true)
              const r = await verwijderPunt(punt.id)
              setBezig(false)
              if (!r.ok) { toast.error(r.error); return }
              naWijziging()
            }}
            aria-label="Punt verwijderen"
            style={{
              flexShrink: 0, width: 30, height: 30, borderRadius: 8, padding: 0,
              border: `1px solid ${RAND}`, background: OPPERVLAK, color: GRIJS,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >×</button>
        )}
      </div>

      <FotoStrip
        titel=""
        knop="Foto toevoegen"
        fotos={punt.fotos}
        lezen={lezen}
        uploaden={async file => {
          const fd = new FormData()
          fd.set('foto', file)
          fd.set('punt_id', punt.id)
          return uploadBezoekFoto(bezoekId, fd)
        }}
        verwijderen={id => verwijderBezoekFoto(id)}
        naWijziging={naWijziging}
      />

      <div style={{ marginTop: 10 }}>
        <AandachtspuntVinkje
          aan={punt.is_aandachtspunt}
          lezen={lezen || punt.opgepakt}
          onWissel={async () => {
            const r = await updatePunt(punt.id, { is_aandachtspunt: !punt.is_aandachtspunt })
            if (!r.ok) { toast.error(r.error); return }
            naWijziging()
          }}
        />
        {punt.opgepakt && (
          <div style={{ fontSize: 11.5, color: GRIJS, marginTop: 4, paddingLeft: 30 }}>
            Al in behandeling op het dossier — intrekken kan daar.
          </div>
        )}
      </div>
    </div>
  )
}

/** Het vinkje dat bepaalt of een punt ook als aandachtspunt op het dossier komt. */
function AandachtspuntVinkje({
  aan, lezen, onWissel,
}: {
  aan: boolean
  lezen: boolean
  onWissel: () => void
}) {
  return (
    <button
      type="button"
      disabled={lezen}
      onClick={onWissel}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
        padding: 0, border: 'none', background: 'none', textAlign: 'left',
        fontFamily: 'inherit', cursor: lezen ? 'default' : 'pointer',
        opacity: lezen && !aan ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
        border: `2px solid ${aan ? GROEN : RAND}`,
        background: aan ? GROEN : 'transparent',
        color: '#fff', fontSize: 13, lineHeight: '17px', textAlign: 'center', fontWeight: 700,
      }}>{aan ? '✓' : ''}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: TEKST }}>
          Ook als aandachtspunt op het dossier
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: GRIJS, marginTop: 1 }}>
          Krijgt een nummer en opvolging
        </span>
      </span>
    </button>
  )
}

/**
 * Voortgang van één discipline.
 *
 * Schuifbalk én een numeriek veldje: een percentage op een steiger is een schatting, maar wie
 * precies wil zijn moet dat kunnen. Opslaan gebeurt bij het loslaten en niet bij elke beweging
 * — anders zijn het tientallen verzoeken per sleep.
 */
function VoortgangRegel({
  discipline, lezen, laatste, opslaan,
}: {
  discipline: BezoekDiscipline
  lezen: boolean
  laatste: boolean
  opslaan: (pct: number | null) => void | Promise<unknown>
}) {
  const [lokaal, setLokaal] = useState<number | null>(discipline.voortgang_pct)

  const bewaar = (v: number | null) => {
    if (v !== discipline.voortgang_pct) opslaan(v)
  }

  return (
    <div style={{ marginBottom: laatste ? 0 : 14 }}>
      <span style={label}>{discipline.naam}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range" min={0} max={100} step={5}
          value={lokaal ?? 0}
          disabled={lezen}
          onChange={e => setLokaal(Number(e.target.value))}
          onPointerUp={() => bewaar(lokaal)}
          onKeyUp={() => bewaar(lokaal)}
          style={{ flex: 1, minWidth: 0, accentColor: GROEN }}
          aria-label={'Voortgang ' + discipline.naam}
        />
        <input
          type="number" inputMode="numeric" min={0} max={100}
          value={lokaal ?? ''}
          disabled={lezen}
          placeholder="—"
          onChange={e => setLokaal(e.target.value === '' ? null : Number(e.target.value))}
          onBlur={() => bewaar(lokaal)}
          style={{ ...veld, width: 72, flexShrink: 0, textAlign: 'right' }}
        />
        <span style={{ fontSize: 14, color: GRIJS, flexShrink: 0 }}>%</span>
      </div>
    </div>
  )
}
