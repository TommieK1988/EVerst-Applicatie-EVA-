'use server'

/**
 * Wat er bij jou ligt om goed te keuren, over de vier bronnen heen.
 *
 * Waarom één widget en niet vier meldingen: goedkeurwerk komt uit verschillende hoeken
 * (inkoopfacturen uit Bouw7, offertes en werkbegrotingen uit EVA, uren uit Bouw7) en dat
 * betekende tot nu toe vier plekken kijken — of, bij de eerste opzet van de inkoopmodule,
 * een stortvloed aan meldingen. Eén lijst met een teller is de juiste vorm: je haalt je werk
 * op, in plaats van dat het jou achterna komt.
 *
 * TELLEN OF OPSOMMEN — dat verschilt per bron, en dat is bewust. Inkoopfacturen en uren zijn
 * stapelwerk: je keurt ze in hun eigen scherm in één sessie af, dus staan ze hier als één regel
 * met een aantal. Offertes en werkbegrotingen zijn stuk voor stuk een beslissing over een
 * bepaald dossier, met een eigen deadline — die hoor je bij naam te zien, anders weet je niet
 * waar je aan begint en waarom het haast heeft.
 *
 * **Uren zitten hier bewust NIET in.** Die telling vereist een live Bouw7-call over een
 * periode van weken, en de afspraak in dit project is dat een schermbezoek nooit een
 * Bouw7-call doet. De widget laadt dat aantal apart na met `getUrenTeFiatterenAantal()`.
 */

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang } from '@/lib/auth/rechten'
import { INKOOP_STATUS_WORKFLOW_LOOPT } from '@/lib/bouw7/inkoop-status'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'
import { dossierSegment, offerteHref } from '@/lib/dossiers/href'
import { periodeBereik } from '@/lib/uren/types'

export type GoedkeurenSoort = 'inkoopfactuur' | 'offerte' | 'werkbegroting'

export type GoedkeurenItem = {
  id: string
  soort: GoedkeurenSoort
  titel: string
  subtitel: string | null
  href: string | null
  /** Sinds wanneer het bij je ligt (of, in het afgehandeld-blok: wanneer het besloten is). */
  datum: string | null
  /**
   * De deadline van het dossier: de datum waarop de offerte verzonden had moeten zijn. Stuurt de
   * volgorde van de lijst; `null` (geen deadline afgesproken) zakt naar onderen.
   */
  deadline?: string | null
  /** Alleen in het afgehandeld-blok: is het goedgekeurd of teruggestuurd? */
  akkoord?: boolean
}

/**
 * De inkoopfacturen als een enkele regel.
 *
 * Ze stonden hier eerst per stuk, en dat maakte de widget een lijst inkoopfacturen met wat
 * offertes eronder: een drukke week bij de crediteuren duwde het werk waar je echt over moet
 * BESLISSEN uit beeld. Een factuur fiatteren doe je bovendien toch in het inkoopscherm, waar ze
 * op tabblad "Te accorderen door mij" al bij elkaar staan -- dus is een regel met een teller
 * precies genoeg om je die kant op te sturen.
 */
export type GoedkeurenInkoop = {
  aantal: number
  /** Totaal incl. btw van wat er op jouw fiattering wacht. */
  bedrag: number
  /** Vroegste vervaldatum in de stapel -- de reden om er vandaag naar te kijken. */
  eersteVervaldatum: string | null
}

export type GoedkeurenData = {
  /** Offertes en werkbegrotingen, op deadline. Inkoop en uren staan apart: dat zijn tellers. */
  ligtBijJou: GoedkeurenItem[]
  inkoop: GoedkeurenInkoop
  afgehandeld: GoedkeurenItem[]
  aantallen: { inkoopfactuur: number; offerte: number; werkbegroting: number }
  /**
   * Wanneer de inkoopfacturen voor het laatst uit Bouw7 zijn gehaald.
   *
   * Dit staat er expliciet in omdat de teller anders stil kan liegen: de Bouw7-sync draait
   * twee keer per dag, dus wie 's ochtends in Bouw7 tien facturen fiatteert ziet ze hier tot de
   * middagrun nog staan. Bewust geen extra sync erbij — wel zichtbaar maken waar de stand
   * vandaan komt, zodat je weet of je op de knop Synchroniseer moet drukken.
   */
  inkoopSyncOp: string | null
}

const GEEN_INKOOP: GoedkeurenInkoop = { aantal: 0, bedrag: 0, eersteVervaldatum: null }

const LEEG: GoedkeurenData = {
  ligtBijJou: [], inkoop: GEEN_INKOOP, afgehandeld: [],
  aantallen: { inkoopfactuur: 0, offerte: 0, werkbegroting: 0 },
  inkoopSyncOp: null,
}

/** Hoe ver terug het "afgehandeld voor jou"-blok kijkt. */
const AFGEHANDELD_DAGEN = 14

export async function getGoedkeurenWidget(): Promise<GoedkeurenData> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return LEEG

  const rechten = await getEffectieveRechten(medewerker)
  const magInkoop = heeftModuleToegang(rechten, 'inkoopfacturen', 'lezen')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const sinds = new Date(Date.now() - AFGEHANDELD_DAGEN * 86_400_000).toISOString()

  const [inkoopRes, openRes, afgehandeldRes, inkoopSyncOp] = await Promise.all([
    // Inkoopfacturen waar ik de huidige fiatteur ben. Gebonden aan het inkooprecht: zonder dat
    // recht hoort iemand deze regels niet te zien, ook niet als teller op zijn startpagina.
    // `count: 'exact'` naast de rijen: de teller moet kloppen ook als de stapel groter is dan wat
    // we ophalen. De rijen zelf zijn er alleen voor het totaalbedrag en de vroegste vervaldatum.
    magInkoop
      ? supabase
          .from('inkoopfacturen')
          .select('id, bedrag_incl, vervaldatum', { count: 'exact' })
          .eq('status', 'open')
          .eq('huidige_goedkeurder_id', medewerker.id)
          .in('bouw7_status', INKOOP_STATUS_WORKFLOW_LOOPT)
          .order('vervaldatum', { ascending: true, nullsFirst: false })
          .limit(500)
      : Promise.resolve({ data: [], count: 0 }),

    // Offertes en werkbegrotingen die op mijn oordeel wachten. `gedelegeerd_aan` telt mee:
    // wie het overgedragen kreeg is degene die moet handelen.
    supabase
      .from('goedkeuringen')
      .select('id, object_type, object_id, dossier_id, aangevraagd_op, aangevraagd_door, dossiers:dossier_id (titel, dossiernummer, hoofdstatus, servicedesk_substatus, deadline)')
      .eq('status', 'aangevraagd')
      .or(`beoordelaar_id.eq.${medewerker.id},gedelegeerd_aan.eq.${medewerker.id}`)
      .order('aangevraagd_op', { ascending: true })
      .limit(50),

    // Mijn eigen aanvragen die iemand heeft afgehandeld — de terugmelding "de controller heeft
    // je werkbegroting goedgekeurd". Alleen recent: dit blok is een seintje, geen archief.
    supabase
      .from('goedkeuringen')
      .select('id, object_type, object_id, dossier_id, status, beoordeeld_op, beoordelaar:beoordeeld_door (voornaam, tussenvoegsel, achternaam), dossiers:dossier_id (titel, dossiernummer, hoofdstatus, servicedesk_substatus)')
      .eq('aangevraagd_door', medewerker.id)
      .in('status', ['goedgekeurd', 'afgekeurd'])
      .gte('beoordeeld_op', sinds)
      .order('beoordeeld_op', { ascending: false })
      .limit(20),

    magInkoop ? getLaatsteSyncTijd('inkoopfacturen') : Promise.resolve(null),
  ])

  type DossierRef = {
    titel: string | null; dossiernummer: string | null
    hoofdstatus: string | null; servicedesk_substatus: string | null
    deadline?: string | null
  } | null

  // Welke van deze offertes bestaan nog? Een verwijderde offerte laat zijn goedkeurverzoek
  // achter -- `goedkeuringen.object_id` is polymorf en heeft dus geen referentiesleutel die hem
  // opruimt. Zo'n wees bleef in deze lijst staan als werk dat op jou wacht, en klikte je erop dan
  // kwam je op een 404. De migratie 20260909d trekt ze voortaan in; deze controle is de tweede
  // grendel, voor rijen die langs een ander pad alsnog los raken.
  type GoedkeuringRij = {
    id: string; object_type: string; object_id: string; dossier_id: string | null
    aangevraagd_op?: string; status?: string; beoordeeld_op?: string | null
    beoordelaar?: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null
    dossiers: DossierRef
  }

  const alleRijen = [
    ...((openRes.data ?? []) as GoedkeuringRij[]),
    ...((afgehandeldRes.data ?? []) as GoedkeuringRij[]),
  ]
  const offerteIds = [...new Set(alleRijen.filter(g => g.object_type === 'offerte').map(g => g.object_id))]
  const bestaandeOffertes = new Set<string>()
  if (offerteIds.length > 0) {
    const { data } = await supabase.from('quotes').select('id').in('id', offerteIds)
    for (const q of (data ?? []) as { id: string }[]) bestaandeOffertes.add(q.id)
  }
  const bestaatNog = (g: { object_type: string; object_id: string }) =>
    g.object_type !== 'offerte' || bestaandeOffertes.has(g.object_id)

  /** Wat `offerteHref` nodig heeft om de Calculatie-tab van het juiste dossier te vinden. */
  const dossierRef = (g: GoedkeuringRij) => g.dossier_id
    ? {
        id: g.dossier_id,
        hoofdstatus: g.dossiers?.hoofdstatus ?? null,
        servicedeskSubstatus: g.dossiers?.servicedesk_substatus ?? null,
      }
    : null

  const inkoopRijen = (inkoopRes.data ?? []) as {
    id: string; bedrag_incl: number | null; vervaldatum: string | null
  }[]
  const inkoop: GoedkeurenInkoop = {
    aantal: inkoopRes.count ?? inkoopRijen.length,
    bedrag: inkoopRijen.reduce((s, f) => s + (f.bedrag_incl ?? 0), 0),
    eersteVervaldatum: inkoopRijen.find(f => f.vervaldatum)?.vervaldatum ?? null,
  }

  const ligtBijJou: GoedkeurenItem[] = []

  for (const g of (openRes.data ?? []) as GoedkeuringRij[]) {
    if (!bestaatNog(g)) continue
    const d = g.dossiers
    const isWb = g.object_type === 'werkbegroting'
    const seg = d ? dossierSegment(d.hoofdstatus, d.servicedesk_substatus) : null
    ligtBijJou.push({
      id: g.id,
      soort: isWb ? 'werkbegroting' : 'offerte',
      titel: d ? [d.dossiernummer, d.titel].filter(Boolean).join(' — ') : (isWb ? 'Werkbegroting' : 'Offerte'),
      subtitel: isWb ? 'Werkbegroting' : 'Offerte',
      href: isWb
        ? (g.dossier_id && seg ? `/${seg}/${g.dossier_id}/werkbegroting` : null)
        : offerteHref(g.object_id, dossierRef(g)),
      datum: g.aangevraagd_op ?? null,
      deadline: d?.deadline ?? null,
    })
  }

  // Op deadline, want dat is de datum waar iemand op wacht -- niet de datum waarop het bij jou op
  // de stapel kwam. Zonder deadline naar onderen: dat is geen "later" maar "niet afgesproken", en
  // dat hoort niet boven werk met een harde datum te staan. Gelijke deadline: langst wachtend eerst.
  ligtBijJou.sort((a, b) => {
    if ((a.deadline ?? '') !== (b.deadline ?? '')) {
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline < b.deadline ? -1 : 1
    }
    return (a.datum ?? '') < (b.datum ?? '') ? -1 : 1
  })

  const afgehandeld: GoedkeurenItem[] = ((afgehandeldRes.data ?? []) as GoedkeuringRij[])
    .filter(bestaatNog)
    .map(g => {
    const d = g.dossiers
    const isWb = g.object_type === 'werkbegroting'
    const seg = d ? dossierSegment(d.hoofdstatus, d.servicedesk_substatus) : null
    const door = g.beoordelaar
      ? [g.beoordelaar.voornaam, g.beoordelaar.tussenvoegsel, g.beoordelaar.achternaam].filter(Boolean).join(' ')
      : null
    const akkoord = g.status === 'goedgekeurd'
    return {
      id: g.id,
      soort: (isWb ? 'werkbegroting' : 'offerte') as GoedkeurenSoort,
      titel: d ? [d.dossiernummer, d.titel].filter(Boolean).join(' — ') : (isWb ? 'Werkbegroting' : 'Offerte'),
      subtitel: `${isWb ? 'Werkbegroting' : 'Offerte'} ${akkoord ? 'goedgekeurd' : 'teruggestuurd'}${door ? ` door ${door}` : ''}`,
      href: isWb
        ? (g.dossier_id && seg ? `/${seg}/${g.dossier_id}/werkbegroting` : null)
        : offerteHref(g.object_id, dossierRef(g)),
      datum: g.beoordeeld_op ?? null,
      akkoord,
    }
  })

  return {
    ligtBijJou,
    inkoop,
    afgehandeld,
    inkoopSyncOp,
    aantallen: {
      inkoopfactuur: inkoop.aantal,
      offerte:       ligtBijJou.filter(i => i.soort === 'offerte').length,
      werkbegroting: ligtBijJou.filter(i => i.soort === 'werkbegroting').length,
    },
  }
}

/**
 * Aantal uurregels dat op jouw fiattering wacht.
 *
 * Apart van `getGoedkeurenWidget` omdat dit wél Bouw7 aanroept: een gepagineerde ophaal. De
 * widget haalt dit ná het renderen op, zodat de startpagina niet op Bouw7 staat te wachten en
 * gewoon werkt als Bouw7 er even uit ligt.
 *
 * Hetzelfde bereik als `/uren?periode=te_keuren`, waar de regel je heen brengt. Dat mag geen
 * eigen keuze zijn: telde de widget een kwartaal en het scherm een jaar, dan klik je op "8 te
 * fiatteren" en zie je er twaalf staan — of erger, andersom. De ophaal kost hier niets extra,
 * want Bouw7 pagineert over de níet-goedgekeurde regels, niet over de periode.
 */
export async function getUrenTeFiatterenAantal(): Promise<{ aantal: number; fout: string | null }> {
  try {
    const { van, tot } = periodeBereik('te_keuren')

    const { getMijnTeKeurenUren } = await import('@/lib/uren/bouw7-goedkeuring')
    const res = await getMijnTeKeurenUren(van, tot)
    if (res.fout) return { aantal: 0, fout: res.fout }
    return { aantal: res.alsTeamleider.length + res.alsProjectleider.length, fout: null }
  } catch (e) {
    return { aantal: 0, fout: e instanceof Error ? e.message : 'Uren konden niet worden opgehaald' }
  }
}
