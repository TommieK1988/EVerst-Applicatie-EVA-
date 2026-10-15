'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { getLayouts } from '@/app/(platform)/everts-calc/actions/quote-instellingen'
import { getBetalingscondities, type Betalingsconditie } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import { getAlgemeneVoorwaarden, type AlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'
import { maakQuoteVanuitProjectMetImport } from '@/app/(platform)/everts-calc/actions/quotes'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import type { Groep, Calculatieregel } from '@/lib/everts-calc/types'
import { isTekstregel } from '@/lib/everts-calc/types'
import { buildNummers, buildStructuur } from '@/lib/everts-calc/import-structuur'
import { tijdfactor } from '@/lib/everts-calc/tijdtoeslag'

export interface OfferteAanmaakOpties {
  open: boolean
  projectId: string
  /** Scenario (calculatie) waarvan de offerte gemaakt wordt. Zonder → standaard/eerste. */
  scenarioId?: string
  /** Dossier waarin de offerte inline wordt aangemaakt — koppelt project ⇄ dossier. */
  dossierId?: string | null
  projectNaam: string
  clientNaam: string | null
  projectNummer: string | null
  type: QuoteType
  /** Meerwerkregel waarvan dit de offerte is — tagt de offerte als meerwerk-offerte. */
  meerwerkRegelId?: string | null
  /** Waar je naartoe gaat na aanmaken. Standaard de losse offerte-preview; geef een
   *  dossier-tab-URL mee om in het dossier te blijven. */
  terugNaarUrl?: string
  /** De calculatie eerst van de server ophalen. Uit vanuit het calculatiescherm: daar
   *  staat de actuele stand al in het werkgeheugen (en is net opgeslagen), en een
   *  late hydratie zou een keuze uit stap 2 kunnen overschrijven. */
  vanServerLaden?: boolean
}

export interface Layout {
  id: string
  naam: string
  beschrijving?: string | null
  is_standaard: boolean
}

/**
 * Gegevens en de aanmaak-actie achter het offertevenster: lay-outs, aantallen voor de
 * samenvatting, en het omzetten van de calculatie naar een offerte.
 */
export function useOfferteAanmaken({
  open, projectId, scenarioId, dossierId, projectNaam, clientNaam, projectNummer, type, meerwerkRegelId, terugNaarUrl,
  vanServerLaden = true,
}: OfferteAanmaakOpties) {
  const router = useRouter()
  const isIntern = type === 'interne_calculatie'
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [gekozenLayoutId, setGekozenLayoutId] = useState<string | null>(null)
  const [heeftBetalingscondities, setHeeftBetalingscondities] = useState(true)
  const [condities, setCondities] = useState<Betalingsconditie[]>([])
  const [voorwaarden, setVoorwaarden] = useState<AlgemeneVoorwaarden[]>([])
  const [aantalRegels, setAantalRegels] = useState<number | null>(null)
  const [aantalBijlagen, setAantalBijlagen] = useState(0)
  const [loading, setLoading] = useState(false)
  const [fetchingData, setFetchingData] = useState(false)

  useEffect(() => {
    if (!open) return
    setFetchingData(true)

    // Een interne begroting krijgt de begrotingsstaat-lay-out, een offerte de
    // offerte-lay-out. Ze delen het sjabloonmechanisme maar niet de inhoud: op de
    // interne begroting staan kostprijs, uren en opslag, en die horen niet in een
    // document dat naar de klant kan.
    const layoutSoort = type === 'interne_calculatie' ? 'interne_begroting' : 'offerte'

    Promise.all([getLayouts(layoutSoort), getBetalingscondities(), getAlgemeneVoorwaarden()]).then(([lays, bcs, avs]) => {
      setLayouts(lays)
      setCondities(bcs)
      setVoorwaarden(avs)
      const standaard = lays.find((l: Layout) => l.is_standaard)
      setGekozenLayoutId(standaard?.id ?? lays[0]?.id ?? null)
      setHeeftBetalingscondities(bcs.length > 0)
      setFetchingData(false)
    }).catch(() => setFetchingData(false))

    // Tel calculatieregels voor het gekozen (of standaard) scenario. De calculatie
    // eerst uit Supabase halen: dit scherm kan geopend worden zonder dat de
    // calculatie-omgeving in deze sessie open is geweest.
    ;(async () => {
      try {
        const { getScenarios, getGroepen, getCalculatieregels, hydrateCalculatie } =
          await import('@/lib/everts-calc/local-store')
        const { laadCalculatieSnapshot } = await import('@/app/(platform)/everts-calc/actions/sync')
        if (vanServerLaden) {
          const snap = await laadCalculatieSnapshot(projectId)
          if (snap) hydrateCalculatie(projectId, snap)
        }

        const scenarios = getScenarios(projectId)
        const actief = scenarioId
          ? scenarios.find(s => s.id === scenarioId)
          : (scenarios.find(s => s.is_standaard) ?? scenarios[0])
        const groepen = actief ? getGroepen(actief.id) : []
        const count = groepen.reduce((sum, g) => sum + getCalculatieregels(g.id).length, 0)
        setAantalRegels(count)

        // PDF-bijlages staan in een eigen tabel (niet in de snapshot), dus apart ophalen.
        if (actief) {
          const { getCalculatieBijlagen } = await import('@/app/(platform)/everts-calc/actions/offerte-bijlagen')
          setAantalBijlagen((await getCalculatieBijlagen(projectId, actief.id)).length)
        }
      } catch {
        setAantalRegels(0)
      }
    })()
  }, [open, projectId, scenarioId, type, vanServerLaden])

  /** Bijlages opnieuw tellen, bijv. na stap 2 waar je er een kunt toevoegen. */
  const verversBijlagen = useCallback(async () => {
    try {
      const { getScenarios } = await import('@/lib/everts-calc/local-store')
      const scenarios = getScenarios(projectId)
      const actief = scenarioId ? scenarios.find(s => s.id === scenarioId) : (scenarios.find(s => s.is_standaard) ?? scenarios[0])
      if (!actief) return
      const { getCalculatieBijlagen } = await import('@/app/(platform)/everts-calc/actions/offerte-bijlagen')
      setAantalBijlagen((await getCalculatieBijlagen(projectId, actief.id)).length)
    } catch { /* alleen voor de samenvatting; niet blokkerend */ }
  }, [projectId, scenarioId])

  async function handleAanmaken() {
    setLoading(true)
    try {
      const { getGroepen, getCalculatieregels, getComponentregels, getScenarios, slaScenarioOp } = await import('@/lib/everts-calc/local-store')
      const { berekenCalculatieregel, scenarioDefaultOpslag } = await import('@/lib/everts-calc/calculations')

      // Filter op het gekozen (of standaard) scenario van dit project
      const scenarios = getScenarios(projectId)
      const actiefScenario = scenarioId
        ? scenarios.find(s => s.id === scenarioId)
        : (scenarios.find(s => s.is_standaard) ?? scenarios[0])

      // Zorg dat de calculatie een nummer heeft (kan nog ontbreken als het
      // reserve-effect nog niet klaar was) zodat offerte en calculatie hetzelfde
      // nummer krijgen, en dat de versie-velden geïnitialiseerd zijn (v1, root =
      // zichzelf) zodat de versiereeks vanaf de eerste offerte klopt.
      let offerteNummer = actiefScenario?.nummer ?? null
      const scenarioVersie = actiefScenario?.versie ?? 1
      if (actiefScenario) {
        const patch: Record<string, unknown> = {}
        if (!offerteNummer) {
          const { reserveerOfferteNummer } = await import('@/app/(platform)/everts-calc/actions/quotes')
          offerteNummer = await reserveerOfferteNummer()
          if (offerteNummer) patch.nummer = offerteNummer
        }
        if (actiefScenario.versie == null) patch.versie = 1
        if (actiefScenario.versie_root_id == null) patch.versie_root_id = actiefScenario.id
        if (Object.keys(patch).length > 0) {
          slaScenarioOp({ ...actiefScenario, ...patch })
        }
      }

      const alleGroepen: Groep[] = actiefScenario ? getGroepen(actiefScenario.id) : getGroepen()
      const alleRegels: Calculatieregel[] = getCalculatieregels()
      const alleComps = getComponentregels()

      const nummers = buildNummers(alleGroepen)
      // Standaard-opslag van de calculatie zelf; 0% blijft 0% (= kostprijs in de offerte).
      const defaultOpslag = scenarioDefaultOpslag(actiefScenario)
      const importRegels: Parameters<typeof maakQuoteVanuitProjectMetImport>[0]['importRegels'] = []

      for (const groep of alleGroepen.sort((a, b) => a.volgorde - b.volgorde)) {
        const regelsBijGroep = alleRegels
          .filter(r => r.groep_id === groep.id)
          .sort((a, b) => a.volgorde - b.volgorde)

        if (regelsBijGroep.length === 0) continue

        for (const regel of regelsBijGroep) {
          const comps = alleComps.filter((c: { calculatieregel_id: string }) => c.calculatieregel_id === regel.id)
          // Met de tijdtoeslag van de groep: de offerte bevriest uren en arbeid zoals verkocht.
          const berekend = berekenCalculatieregel(regel, comps, regel.opslag_pct ?? defaultOpslag, tijdfactor(groep))

          importRegels.push({
            groep_id: groep.id,
            groep_naam: groep.naam,
            groep_nummer: nummers.get(groep.id) ?? null,
            groep_niveau: groep.niveau,
            groep_optioneel: groep.optioneel ?? false,
            omschrijving: regel.omschrijving,
            hoeveelheid: regel.hoeveelheid,
            eenheid: regel.eenheid,
            eenheidsprijs: +berekend.vp_pe.toFixed(2),
            kostprijs_pe: +berekend.kp_pe.toFixed(2),
            uren_pe: +berekend.uren_pe.toFixed(3),
            // Kostensoort-uitsplitsing voor de begrotingsstaat. Nul is hier een
            // echte nul (geen arbeid in deze post); leeg blijft voorbehouden aan
            // regels die nooit uit een calculatie zijn gekomen.
            arbeid_pe: +berekend.arbeid_pe.toFixed(4),
            materieel_pe: +berekend.materieel_pe.toFixed(4),
            oa_pe: +berekend.oa_pe.toFixed(4),
            kostengroep: regel.kostengroep ?? null,
            is_verrekenbaar: regel.is_verrekenbaar ?? false,
            calculatieregel_id: regel.id,
            opmerking: regel.werkomschrijving ?? null,
            is_stelpost: regel.is_stelpost ?? false,
            // Tekstregel: de server zet hoeveelheid/prijs/BTW op nul en laat hem
            // buiten de subtotalen. Alleen de omschrijving haalt de offerte.
            soort: isTekstregel(regel) ? 'tekst' : null,
            // Zonder eigen keuze het standaardtarief van de calculatie (leeg → server pakt 21%).
            btw_pct: regel.btw_pct ?? actiefScenario?.btw_pct_default ?? null,
            btw_tarief_id: regel.btw_tarief_id ?? actiefScenario?.btw_tarief_id_default ?? null,
            // Alleen de koppeling; de tekst bevriest de server op dít moment.
            schilderbehandeling_id: regel.schilderbehandeling_id ?? null,
            schilderbehandeling: regel.schilderbehandeling ?? null,
            werkomschrijving_afbeeldingen: regel.werkomschrijving_afbeeldingen ?? null,
          })
        }
      }

      // Structuur incl. lege hoofdstuk-groepen (niveau 1), in outline-volgorde.
      const groepenMetRegels = new Set(importRegels.map(r => r.groep_id))
      const structuur = buildStructuur(alleGroepen, gid => groepenMetRegels.has(gid), nummers)

      const { id } = await maakQuoteVanuitProjectMetImport({
        projectId,
        scenarioId: actiefScenario?.id ?? null,
        // Offerte neemt het nummer van de calculatie over (leeg → DB genereert er een).
        quoteNummer: offerteNummer,
        // Offerte erft ook de versie van de calculatie.
        versie: scenarioVersie,
        dossierId,
        projectNaam,
        clientNaam,
        projectNummer,
        type,
        layoutId: gekozenLayoutId,
        // Keuzes uit het Offerte-instellingen-blok (scenario). Een interne begroting
        // gaat niet naar de klant: geen voorwaarden of termijnen.
        betalingsconditieId: isIntern ? null : actiefScenario?.betalingsconditie_id ?? null,
        voorwaardenId: isIntern ? null : actiefScenario?.algemene_voorwaarden_id ?? null,
        // Vrije offerte-teksten van de calculatie (leeg → standaardsjabloon).
        inleidingTekst: actiefScenario?.inleiding_tekst ?? null,
        // Meerwerk-offerte: koppel aan de meerwerkregel (leeg → gewone offerte).
        meerwerkRegelId: meerwerkRegelId ?? null,
        importRegels,
        structuur,
      })

      // In het dossier blijven: terug naar de dossier-tab en direct de nieuwe offerte
      // inline openen (?offerte={id}); anders de losse offerte-preview.
      if (terugNaarUrl) {
        const sep = terugNaarUrl.includes('?') ? '&' : '?'
        router.push(`${terugNaarUrl}${sep}offerte=${id}`)
      } else {
        router.push(`/everts-calc/quotes/${id}/preview`)
      }
    } catch (e) {
      console.error('Offerte aanmaken mislukt:', e)
      // Niet stil falen: zonder melding lijkt de knop niets te doen.
      toast.error(isIntern
        ? 'Interne begroting aanmaken mislukt. Probeer het opnieuw.'
        : 'Offerte aanmaken mislukt. Controleer onder Offerte › Voorwaarden, tekst & bijlages de betalingscondities en algemene voorwaarden en probeer het opnieuw.')
      setLoading(false)
    }
  }

  return {
    isIntern, layouts, gekozenLayoutId, setGekozenLayoutId, heeftBetalingscondities,
    condities, voorwaarden, aantalRegels, aantalBijlagen, verversBijlagen, loading, fetchingData, handleAanmaken,
  }
}
