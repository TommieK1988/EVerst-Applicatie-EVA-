'use client'

/**
 * De mobiele opname in vier stappen: ruimte → onderdeel kiezen → regel invullen → overzicht.
 *
 * ── Waarom dit scherm eigen state houdt ──────────────────────────────────────
 *
 * `KwaliteitRonde` leunt op `router.refresh()` na elke mutatie: wat op het scherm staat is dan
 * gegarandeerd wat er is opgeslagen. Hier is dat bewust ANDERS. Een opname loopt door een woning
 * met wisselend bereik, en een refresh per regel maakt het scherm onbruikbaar zodra 4G hapert.
 * Daarom: optimistisch bijwerken in React-state, en de server-actie ernaast. Mislukt die, dan komt
 * er een melding en blijft de regel zichtbaar gemarkeerd staan.
 *
 * Het versturen loopt daarom via `lib/opname/wachtrij.ts`: een mutatie gaat eerst naar IndexedDB en
 * daarna de deur uit. Valt de verbinding weg, dan blijft hij staan en gaat hij alsnog mee zodra er
 * weer bereik is. Een opname met een niet-lege wachtrij kan NIET worden afgerond — anders vertrekt
 * er een opname naar de calculator waar regels uit ontbreken.
 *
 * Prijzen zijn wél zichtbaar (bewuste keuze): de opnemer stemt ter plaatse af met de opzichter van
 * de corporatie en moet kunnen zeggen wat iets kost.
 */

import React from 'react'
import { useRouter } from 'next/navigation'
import type {
  OpnameFoto,
  OpnameMetRegels,
  OpnameOnderdeelKeuze,
  OpnameRegel,
  OpnameRuimte,
} from '@everts/database/opname-types'
import { groepeerPerRuimte } from '@everts/database/opname-types'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import { rondOpnameAf, slaRegelOp, uploadOpnameFoto, verwijderRegel, type AfrondControle } from '@/lib/opname/opnames'
import {
  abonneerOpWachtrij, registreerAfhandelaar, startWachtrijLus, zetInWachtrij,
  type Mutatie,
} from '@/lib/opname/wachtrij'
import { regelTotaal } from '@/lib/opname/prijs'
import OnderdeelKiezer from './OnderdeelKiezer'
import FotoStrook, { type StrookFoto } from './FotoStrook'
import {
  AMBER, chip, euro, GRIJS, GROEN, kaart, label, primaireKnop, RAND, ROOD,
  secundaireKnop, TEKST, veld, ZACHT,
} from './stijl'

type Stap = 'overzicht' | 'kiezen' | 'regel'

type Concept = {
  regelId: string
  onderdeel: OpnameOnderdeelKeuze | null
  /** Vrije regel: geen bibliotheek-onderdeel, alleen een omschrijving. */
  vrijeOmschrijving: string
  aantal: string
  toelichting: string
  bestaand: boolean
}

export default function OpnameScherm({
  opname,
  onderdelen,
  ruimtes,
  vaakGebruiktIds,
}: {
  opname: OpnameMetRegels
  onderdelen: OpnameOnderdeelKeuze[]
  ruimtes: OpnameRuimte[]
  vaakGebruiktIds: string[]
}) {
  const router = useRouter()
  const bewerkbaar = opname.status === 'concept'

  const [regels, setRegels] = React.useState<OpnameRegel[]>(opname.regels)
  const [fotos, setFotos] = React.useState<OpnameFoto[]>(opname.fotos)
  const [ruimte, setRuimte] = React.useState<string>(
    // Verder waar de opnemer gebleven was: de ruimte van de laatst toegevoegde regel.
    opname.regels.at(-1)?.ruimte ?? ruimtes[0]?.naam ?? '',
  )
  const [eigenRuimte, setEigenRuimte] = React.useState('')
  const [stap, setStap] = React.useState<Stap>('overzicht')
  const [concept, setConcept] = React.useState<Concept | null>(null)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)
  const [ontbreekt, setOntbreekt] = React.useState<AfrondControle['ontbreekt']>([])
  const [wachtend, setWachtend] = React.useState(0)
  /**
   * Foto's die nog in de wachtrij staan. `OpnameFoto` kent geen "wacht"-veld — dat is server-state —
   * dus de vlag leeft hier apart. Zonder dit zou de opnemer een nog niet verstuurde foto kunnen
   * proberen te verwijderen langs de serverweg, en dat mislukt.
   */
  const [wachtendeFotos, setWachtendeFotos] = React.useState<Set<string>>(new Set())

  /**
   * De afhandelaars in een ref: `registreerAfhandelaar` overschrijft per soort, en zonder ref zou
   * een afhandelaar met een verouderde `setRegels`-closure blijven hangen.
   */
  const verwerkers = React.useRef({
    async regelUpsert(m: Mutatie) {
      const res = await slaRegelOp(m.payload as unknown as Parameters<typeof slaRegelOp>[0])
      if (!res.ok) return { ok: false as const, error: res.error }
      // De server rekent de definitieve prijssnapshot uit; die vervangt de optimistische rij.
      setRegels(huidig =>
        [...huidig.filter(r => r.id !== res.regel.id), res.regel].sort((a, b) => a.volgorde - b.volgorde),
      )
      return { ok: true as const }
    },
    async regelVerwijder(m: Mutatie) {
      const res = await verwijderRegel(m.payload.regelId as string)
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error }
    },
    async fotoUpload(m: Mutatie) {
      if (!m.blob) return { ok: false as const, error: 'Foto ontbreekt in de wachtrij' }
      const fd = new FormData()
      fd.append('foto', new File([m.blob], String(m.payload.bestandsnaam ?? 'foto.jpg'), { type: m.blob.type }))
      const res = await uploadOpnameFoto(
        m.opname_id,
        (m.payload.regelId as string | null) ?? null,
        fd,
        'detail',
        m.payload.fotoId as string,
      )
      if (!res.ok) return { ok: false as const, error: res.error }
      setFotos(huidig => [...huidig.filter(f => f.id !== res.foto.id), res.foto])
      setWachtendeFotos(huidig => {
        if (!huidig.has(res.foto.id)) return huidig
        const rest = new Set(huidig)
        rest.delete(res.foto.id)
        return rest
      })
      return { ok: true as const }
    },
  })

  React.useEffect(() => {
    registreerAfhandelaar('regel_upsert', m => verwerkers.current.regelUpsert(m))
    registreerAfhandelaar('regel_verwijder', m => verwerkers.current.regelVerwijder(m))
    registreerAfhandelaar('foto_upload', m => verwerkers.current.fotoUpload(m))
    const stopAbonnement = abonneerOpWachtrij(setWachtend)
    const stopLus = startWachtrijLus()
    return () => {
      stopAbonnement()
      stopLus()
    }
  }, [])

  const totaal = regels.reduce((som, r) => som + (r.regel_verkoop_totaal ?? 0), 0)
  // Losse punten dragen geen prijs; die worden op kantoor afgeprijsd. Apart tellen, zodat het
  // totaal niet suggereert dat de opname compleet geprijsd is.
  const teePrijzen = regels.filter(r => r.verkoop_pe == null).length
  const groepen = groepeerPerRuimte(regels)

  const ruimteNamen = React.useMemo(() => {
    const uit = ruimtes.map(r => r.naam)
    // Ruimtes die de opnemer zelf typte horen ook in de strook, anders verdwijnen ze uit beeld.
    for (const r of regels) {
      const naam = r.ruimte?.trim()
      if (naam && !uit.includes(naam)) uit.push(naam)
    }
    return uit
  }, [ruimtes, regels])

  function fotosVan(regelId: string): StrookFoto[] {
    return fotos
      .filter(f => f.regel_id === regelId)
      .map(f => ({
        id: f.id,
        url: f.url,
        is_hoofdfoto: f.is_hoofdfoto,
        wacht: wachtendeFotos.has(f.id),
      }))
  }

  function startNieuweRegel(onderdeel: OpnameOnderdeelKeuze | null) {
    setConcept({
      // Het id komt van de CLIENT en wordt straks óók de Calculatieregel.id. Daardoor is zowel
      // opnieuw versturen als opnieuw importeren idempotent.
      regelId: crypto.randomUUID(),
      onderdeel,
      vrijeOmschrijving: '',
      aantal: String(onderdeel?.standaard_aantal ?? 1),
      toelichting: '',
      bestaand: false,
    })
    setStap('regel')
  }

  function bewerkRegel(regel: OpnameRegel) {
    setConcept({
      regelId: regel.id,
      onderdeel: regel.onderdeel_id
        ? onderdelen.find(o => o.id === regel.onderdeel_id) ?? null
        : null,
      vrijeOmschrijving: regel.onderdeel_id ? '' : regel.omschrijving,
      aantal: String(regel.aantal),
      toelichting: regel.toelichting_opnemer ?? '',
      bestaand: true,
    })
    if (regel.ruimte) setRuimte(regel.ruimte)
    setStap('regel')
  }

  /**
   * Bewaart het punt waar de opnemer mee bezig is.
   *
   * Alleen de omschrijving is verplicht — bij een los punt is dat de enige harde eis. Locatie mag
   * leeg, en een niet-ingevulde hoeveelheid telt als 1: iemand die voor een deur staat hoort niet
   * te hoeven rekenen.
   *
   * `blijfStaan` bewaart zonder het formulier te verlaten. Dat is nodig zodra er een foto bij komt:
   * `opname_fotos.regel_id` heeft een foreign key, dus de regel moet er eerst zijn.
   */
  async function bewaarConcept(opties: { blijfStaan?: boolean } = {}): Promise<boolean> {
    if (!concept) return false

    const ingevuldAantal = Number(concept.aantal.replace(',', '.'))
    const aantal = Number.isFinite(ingevuldAantal) && ingevuldAantal > 0 ? ingevuldAantal : 1

    if (!concept.onderdeel && !concept.vrijeOmschrijving.trim()) {
      setFout('Vul een omschrijving in')
      return false
    }

    // Locatie is optioneel; leeg betekent dat het punt onder "Overig" komt te staan.
    const gekozenRuimte = (eigenRuimte.trim() || ruimte).trim()

    const volgorde = concept.bestaand
      ? regels.find(r => r.id === concept.regelId)?.volgorde ?? regels.length + 1
      : regels.length + 1

    const invoer = {
      id: concept.regelId,
      opname_id: opname.id,
      onderdeel_id: concept.onderdeel?.id ?? null,
      omschrijving: concept.onderdeel ? undefined : concept.vrijeOmschrijving,
      ruimte: gekozenRuimte || null,
      ruimte_id: ruimtes.find(r => r.naam === gekozenRuimte)?.id ?? null,
      aantal,
      toelichting_opnemer: concept.toelichting.trim() || null,
      volgorde,
    }

    // Optimistische rij: wat de opnemer ziet klopt meteen. De definitieve prijssnapshot komt van de
    // server terug zodra de mutatie is geland — die bevat ook de kostprijs, de uren en de normen,
    // en die kan de telefoon niet zelf uitrekenen (het recept staat er niet op).
    const bestaandeRegel = regels.find(r => r.id === concept.regelId)
    // Los punt: geen prijs (null, niet 0). 0 leest als gratis; null als "nog te prijzen".
    const verkoopPe = concept.onderdeel?.verkoop_pe ?? bestaandeRegel?.verkoop_pe ?? null
    const nu = new Date().toISOString()
    const optimistisch: OpnameRegel = {
      ...(bestaandeRegel ?? {
        onderdeel_code: concept.onderdeel?.code ?? null,
        prijs_soort: concept.onderdeel?.prijs_soort ?? 'vast',
        kostprijs_pe: null,
        uren_pe: null,
        opslag_pct: null,
        btw_tarief_id: null,
        btw_pct: null,
        kostengroep: null,
        normen: [],
        regel_kostprijs_totaal: 0,
        created_at: nu,
        created_by: null,
      }),
      id: concept.regelId,
      opname_id: opname.id,
      onderdeel_id: invoer.onderdeel_id,
      ruimte: gekozenRuimte || null,
      ruimte_id: invoer.ruimte_id,
      volgorde,
      aantal,
      toelichting_opnemer: invoer.toelichting_opnemer,
      omschrijving: concept.onderdeel?.omschrijving ?? concept.vrijeOmschrijving.trim(),
      eenheid: concept.onderdeel?.eenheid ?? bestaandeRegel?.eenheid ?? 'st',
      verkoop_pe: verkoopPe,
      regel_verkoop_totaal: regelTotaal(aantal, verkoopPe),
      client_bijgewerkt_op: nu,
      updated_at: nu,
    } as OpnameRegel

    setBezig(true)
    setFout(null)
    try {
      await zetInWachtrij({
        id: `regel:${concept.regelId}`,
        opname_id: opname.id,
        soort: 'regel_upsert',
        payload: invoer as unknown as Record<string, unknown>,
      })
    } catch (err) {
      setBezig(false)
      setFout(err instanceof Error ? err.message : 'Opslaan mislukt')
      return false
    }
    setBezig(false)

    setRegels(huidig =>
      [...huidig.filter(r => r.id !== optimistisch.id), optimistisch].sort((a, b) => a.volgorde - b.volgorde),
    )
    if (eigenRuimte.trim()) {
      setRuimte(eigenRuimte.trim())
      setEigenRuimte('')
    }

    if (opties.blijfStaan) {
      // Het punt bestaat nu, dus foto's kunnen eraan gehangen worden en een volgende opslag is
      // een bijwerking in plaats van een nieuwe regel.
      setConcept(huidig => (huidig ? { ...huidig, bestaand: true } : huidig))
      return true
    }

    // Na een NIEUW punt terug naar het kiesscherm — in één ruimte volgen er meestal meer achter
    // elkaar. Is er geen bibliotheek, dan is er niets te kiezen en gaat hij naar het overzicht.
    const bestond = concept.bestaand
    setConcept(null)
    setStap(bestond || onderdelen.length === 0 ? 'overzicht' : 'kiezen')
    return true
  }

  async function regelWeg(regelId: string) {
    try {
      await zetInWachtrij({
        id: `regel-weg:${regelId}`,
        opname_id: opname.id,
        soort: 'regel_verwijder',
        payload: { regelId },
      })
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Verwijderen mislukt')
      return
    }
    setRegels(huidig => huidig.filter(r => r.id !== regelId))
    setFotos(huidig => huidig.filter(f => f.regel_id !== regelId))
    setConcept(null)
    setStap('overzicht')
  }

  async function afronden() {
    // Harde regel: met een niet-lege wachtrij zou er een opname naar de calculator vertrekken
    // waar regels of foto's uit ontbreken. Liever wachten dan half opleveren.
    if (wachtend > 0) {
      setFout(
        `Nog ${wachtend} wijziging${wachtend !== 1 ? 'en' : ''} niet verstuurd. ` +
          'Zodra er weer verbinding is gaan ze vanzelf mee; daarna kun je afronden.',
      )
      return
    }
    setBezig(true)
    setFout(null)
    setOntbreekt([])
    const res = await rondOpnameAf(opname.id)
    setBezig(false)
    if (!res.ok) {
      setFout(res.error)
      setOntbreekt(res.ontbreekt ?? [])
      return
    }
    router.push('/m/taken')
    router.refresh()
  }

  /* ─────────────────────────── Onderdeel kiezen ──────────────────────────── */

  if (stap === 'kiezen') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <RuimteStrook
          namen={ruimteNamen}
          actief={ruimte}
          onKies={setRuimte}
          eigen={eigenRuimte}
          onEigen={setEigenRuimte}
        />
        <div style={{ flex: 1 }}>
          <OnderdeelKiezer
            onderdelen={onderdelen}
            vaakGebruiktIds={vaakGebruiktIds}
            onKies={startNieuweRegel}
          />
        </div>
        <MobielStickyFooter>
          <button type="button" style={{ ...secundaireKnop, flex: 1 }} onClick={() => setStap('overzicht')}>
            Terug
          </button>
          <button
            type="button"
            style={{ ...secundaireKnop, flex: 1 }}
            onClick={() => startNieuweRegel(null)}
          >
            + Los punt
          </button>
        </MobielStickyFooter>
      </div>
    )
  }

  /* ────────────────────────────── Regel invullen ─────────────────────────── */

  if (stap === 'regel' && concept) {
    const onderdeel = concept.onderdeel
    const aantal = Number(concept.aantal.replace(',', '.')) || 0
    const regelTotaal = onderdeel?.verkoop_pe != null ? aantal * onderdeel.verkoop_pe : null
    const regelFotos = fotosVan(concept.regelId)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <div style={{ padding: '14px 14px 0', flex: 1 }}>
          <div style={kaart}>
            {onderdeel ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEKST }}>{onderdeel.omschrijving}</div>
                <div style={{ fontSize: 12, color: GRIJS, marginTop: 2 }}>
                  {[onderdeel.code, onderdeel.hoofdgroep].filter(Boolean).join(' · ')}
                </div>
                {onderdeel.toelichting && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: GRIJS }}>{onderdeel.toelichting}</p>
                )}
              </>
            ) : (
              <>
                <span style={label}>Wat moet er gebeuren? (verplicht)</span>
                <input
                  type="text"
                  value={concept.vrijeOmschrijving}
                  onChange={e => setConcept({ ...concept, vrijeOmschrijving: e.target.value })}
                  placeholder="Bijv. plint vervangen achter radiator"
                  style={veld}
                  autoFocus={!concept.bestaand}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: ZACHT }}>
                  Los punt. Locatie, aantal en foto mag je leeg laten; de prijs wordt op kantoor
                  in de calculatie bepaald.
                </p>
              </>
            )}
          </div>

          <div style={kaart}>
            <span style={label}>Locatie{onderdeel ? '' : ' (optioneel)'}</span>
            <RuimteStrook
              namen={ruimteNamen}
              actief={ruimte}
              onKies={setRuimte}
              eigen={eigenRuimte}
              onEigen={setEigenRuimte}
              compact
            />
          </div>

          <div style={kaart}>
            <span style={label}>
              Aantal{onderdeel ? ` (${onderdeel.eenheid})` : ' (optioneel, leeg telt als 1)'}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                aria-label="Minder"
                style={{ ...secundaireKnop, width: 52, fontSize: 20, padding: '10px 0' }}
                onClick={() => {
                  const stapGrootte = onderdeel?.aantal_stap ?? 1
                  const nieuw = Math.max(stapGrootte, (Number(concept.aantal.replace(',', '.')) || 0) - stapGrootte)
                  setConcept({ ...concept, aantal: String(Number(nieuw.toFixed(3))) })
                }}
              >
                −
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={concept.aantal}
                onChange={e => setConcept({ ...concept, aantal: e.target.value })}
                onFocus={e => e.currentTarget.select()}
                style={{ ...veld, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
              />
              <button
                type="button"
                aria-label="Meer"
                style={{ ...secundaireKnop, width: 52, fontSize: 20, padding: '10px 0' }}
                onClick={() => {
                  const stapGrootte = onderdeel?.aantal_stap ?? 1
                  const nieuw = (Number(concept.aantal.replace(',', '.')) || 0) + stapGrootte
                  setConcept({ ...concept, aantal: String(Number(nieuw.toFixed(3))) })
                }}
              >
                +
              </button>
            </div>
            {regelTotaal != null && (
              <p style={{ margin: '10px 0 0', fontSize: 14, color: TEKST }}>
                {euro(onderdeel?.verkoop_pe)} × {aantal} ={' '}
                <strong style={{ color: GROEN }}>{euro(regelTotaal)}</strong>
              </p>
            )}
          </div>

          <div style={kaart}>
            <span style={label}>
              Toelichting{onderdeel?.toelichting_verplicht ? ' (verplicht)' : ' (optioneel)'}
            </span>
            <SpraakTextarea
              value={concept.toelichting}
              onChange={waarde => setConcept({ ...concept, toelichting: waarde })}
              placeholder="Wat de calculator moet weten"
              rows={3}
            />
          </div>

          <div style={kaart}>
            <span style={label}>Foto&apos;s</span>
            <FotoStrook
                opnameId={opname.id}
                regelId={concept.regelId}
                fotos={regelFotos}
                verplicht={!!onderdeel?.foto_verplicht}
                // `opname_fotos.regel_id` heeft een foreign key, dus het punt moet bestaan vóór de
                // foto de wachtrij in gaat. In plaats van de opnemer daarmee lastig te vallen
                // ("bewaar eerst") bewaren we het punt hier zelf. Lukt dat niet — meestal een lege
                // omschrijving — dan gaat de foto niet door en staat de reden in beeld.
                voorbereiden={concept.bestaand ? undefined : () => bewaarConcept({ blijfStaan: true })}
                onVeranderd={nieuwe => {
                  setWachtendeFotos(huidig => {
                    const bij = new Set(huidig)
                    const nogAanwezig = new Set(nieuwe.map(n => n.id))
                    for (const n of nieuwe) if (n.wacht) bij.add(n.id)
                    // Weggehaalde foto's ook uit de set, anders blijft de teller hangen.
                    for (const id of bij) if (!nogAanwezig.has(id)) bij.delete(id)
                    return bij
                  })
                  setFotos(huidig => [
                    ...huidig.filter(f => f.regel_id !== concept.regelId),
                    ...nieuwe.map(n => ({
                      ...(huidig.find(f => f.id === n.id) ?? {
                        id: n.id,
                        opname_id: opname.id,
                        regel_id: concept.regelId,
                        pad: '',
                        soort: 'detail' as const,
                        omschrijving: null,
                        volgorde: 0,
                        created_at: new Date().toISOString(),
                        created_by: null,
                      }),
                      url: n.url,
                      is_hoofdfoto: n.is_hoofdfoto,
                    })),
                  ])
                }}
              />
          </div>

          {fout && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: ROOD, fontWeight: 600 }}>{fout}</p>
          )}

          {concept.bestaand && (
            <button
              type="button"
              onClick={() => void regelWeg(concept.regelId)}
              style={{ ...secundaireKnop, width: '100%', color: ROOD, marginBottom: 10 }}
            >
              Regel verwijderen
            </button>
          )}
        </div>

        <MobielStickyFooter>
          <button
            type="button"
            style={{ ...secundaireKnop, flex: 1 }}
            onClick={() => {
              setConcept(null)
              setFout(null)
              setStap(concept.bestaand ? 'overzicht' : 'kiezen')
            }}
          >
            Annuleren
          </button>
          <button
            type="button"
            style={{ ...primaireKnop, flex: 2 }}
            onClick={() => void bewaarConcept()}
            disabled={bezig}
          >
            {bezig ? 'Bezig…' : concept.bestaand ? 'Opslaan' : 'Toevoegen'}
          </button>
        </MobielStickyFooter>
      </div>
    )
  }

  /* ──────────────────────────────── Overzicht ────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ flex: 1, padding: '14px 14px 0' }}>
        {regels.length === 0 ? (
          <div style={{ ...kaart, textAlign: 'center', padding: '28px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: TEKST }}>
              Nog niets opgenomen
            </p>
            <p style={{ margin: 0, fontSize: 13, color: GRIJS }}>
              {onderdelen.length > 0
                ? 'Kies een locatie en voeg de eerste werkzaamheid toe.'
                : 'Voeg je eerste punt toe. Een omschrijving is genoeg; de prijs komt later.'}
            </p>
          </div>
        ) : (
          groepen.map(groep => (
            <div key={groep.ruimte} style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '0 2px 6px', borderBottom: `1px solid ${RAND}`, marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>{groep.ruimte}</span>
                {groep.verkoop_totaal > 0 && (
                  <span style={{ fontSize: 13, color: GRIJS }}>{euro(groep.verkoop_totaal)}</span>
                )}
              </div>
              {groep.regels.map(regel => {
                const regelFotos = fotos.filter(f => f.regel_id === regel.id)
                const mistFoto = ontbreekt.some(o => o.regelId === regel.id)
                return (
                  <button
                    key={regel.id}
                    type="button"
                    onClick={() => bewerkbaar && bewerkRegel(regel)}
                    style={{
                      ...kaart,
                      width: '100%', textAlign: 'left', display: 'block', marginBottom: 8,
                      border: `1px solid ${mistFoto ? ROOD : RAND}`,
                      cursor: bewerkbaar ? 'pointer' : 'default',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: TEKST }}>{regel.omschrijving}</div>
                        <div style={{ fontSize: 12, color: GRIJS, marginTop: 2 }}>
                          {regel.aantal} {regel.eenheid}
                          {regel.verkoop_pe != null ? ` × ${euro(regel.verkoop_pe)}` : ''}
                          {regelFotos.length > 0 ? ` · ${regelFotos.length} foto${regelFotos.length > 1 ? "'s" : ''}` : ''}
                        </div>
                        {regel.toelichting_opnemer && (
                          <div style={{ fontSize: 12, color: GRIJS, fontStyle: 'italic', marginTop: 4 }}>
                            {regel.toelichting_opnemer}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          flexShrink: 0, fontSize: regel.verkoop_pe == null ? 11 : 14,
                          fontWeight: regel.verkoop_pe == null ? 600 : 700,
                          color: regel.verkoop_pe == null ? ZACHT : TEKST,
                          textAlign: 'right',
                        }}
                      >
                        {regel.verkoop_pe == null ? 'nog te prijzen' : euro(regel.regel_verkoop_totaal)}
                      </div>
                    </div>
                    {mistFoto && (
                      <div style={{ marginTop: 6, fontSize: 12, color: ROOD, fontWeight: 600 }}>
                        {ontbreekt.find(o => o.regelId === regel.id)?.reden}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))
        )}

        {fout && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: ROOD, fontWeight: 600 }}>{fout}</p>
        )}
      </div>

      <MobielStickyFooter style={{ flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%',
            fontSize: 13, color: GRIJS,
          }}
        >
          <span>
            {regels.length} punt{regels.length !== 1 ? 'en' : ''} · {groepen.length} locatie
            {groepen.length !== 1 ? 's' : ''}
            {teePrijzen > 0 && (
              <span style={{ color: GRIJS }}> · {teePrijzen} nog te prijzen</span>
            )}
            {wachtend > 0 && (
              <span style={{ color: AMBER, fontWeight: 700 }}> · {wachtend} wacht op verbinding</span>
            )}
          </span>
          {totaal > 0 && <strong style={{ fontSize: 17, color: TEKST }}>{euro(totaal)}</strong>}
        </div>
        {bewerkbaar ? (
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              type="button"
              style={{ ...primaireKnop, flex: 2 }}
              // Zonder bibliotheek valt er niets te kiezen: dan meteen het formulier voor een los
              // punt, in plaats van een lege kieslijst.
              onClick={() => (onderdelen.length > 0 ? setStap('kiezen') : startNieuweRegel(null))}
            >
              {onderdelen.length > 0 ? '+ Toevoegen' : '+ Punt toevoegen'}
            </button>
            <button
              type="button"
              style={{ ...secundaireKnop, flex: 1 }}
              onClick={afronden}
              disabled={bezig || regels.length === 0 || wachtend > 0}
            >
              {bezig ? 'Bezig…' : 'Afronden'}
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, width: '100%', fontSize: 13, color: GRIJS, textAlign: 'center' }}>
            Deze opname is afgerond.
          </p>
        )}
      </MobielStickyFooter>
    </div>
  )
}

/** Ruimtekiezer: chips uit het sjabloon plus een veld voor een eigen naam. */
function RuimteStrook({
  namen,
  actief,
  onKies,
  eigen,
  onEigen,
  compact = false,
}: {
  namen: string[]
  actief: string
  onKies: (naam: string) => void
  eigen: string
  onEigen: (waarde: string) => void
  compact?: boolean
}) {
  const [eigenOpen, setEigenOpen] = React.useState(false)

  return (
    <div style={{ padding: compact ? 0 : '10px 14px 0' }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
        {namen.map(naam => (
          <button key={naam} type="button" style={chip(actief === naam && !eigen)} onClick={() => { onEigen(''); setEigenOpen(false); onKies(naam) }}>
            {naam}
          </button>
        ))}
        <button type="button" style={chip(eigenOpen || !!eigen)} onClick={() => setEigenOpen(v => !v)}>
          Anders…
        </button>
      </div>
      {(eigenOpen || eigen) && (
        <input
          type="text"
          value={eigen}
          onChange={e => onEigen(e.target.value)}
          placeholder="Eigen ruimtenaam"
          style={{ ...veld, marginBottom: 8 }}
        />
      )}
    </div>
  )
}
