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
 * **Uren zitten hier bewust NIET in.** Die telling vereist een live Bouw7-call over een
 * periode van weken, en de afspraak in dit project is dat een schermbezoek nooit een
 * Bouw7-call doet. De widget laadt dat aantal apart na met `getUrenTeFiatterenAantal()`.
 */

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang } from '@/lib/auth/rechten'
import { INKOOP_STATUS_WORKFLOW_LOOPT } from '@/lib/bouw7/inkoop-status'
import { getLaatsteSyncTijd } from '@/lib/bouw7/sync-status'

export type GoedkeurenSoort = 'inkoopfactuur' | 'offerte' | 'werkbegroting'

export type GoedkeurenItem = {
  id: string
  soort: GoedkeurenSoort
  titel: string
  subtitel: string | null
  href: string | null
  /** Sinds wanneer het bij je ligt (of, in het afgehandeld-blok: wanneer het besloten is). */
  datum: string | null
  /** Alleen in het afgehandeld-blok: is het goedgekeurd of teruggestuurd? */
  akkoord?: boolean
}

export type GoedkeurenData = {
  ligtBijJou: GoedkeurenItem[]
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

const LEEG: GoedkeurenData = {
  ligtBijJou: [], afgehandeld: [],
  aantallen: { inkoopfactuur: 0, offerte: 0, werkbegroting: 0 },
  inkoopSyncOp: null,
}

/** Hoe ver terug het "afgehandeld voor jou"-blok kijkt. */
const AFGEHANDELD_DAGEN = 14

function euro(n: number | null): string | null {
  if (n == null) return null
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

/** Route-segment van een dossier — er bestaat geen /dossiers/[id]. */
function sectie(hoofdstatus: string | null, servicedeskSubstatus: string | null): string | null {
  if (servicedeskSubstatus) return 'servicedesk'
  if (hoofdstatus === 'aanvraag') return 'aanvragen'
  if (hoofdstatus === 'offerte') return 'offertes'
  if (hoofdstatus === 'opdracht') return 'opdrachten'
  return null
}

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
    magInkoop
      ? supabase
          .from('inkoopfacturen')
          .select('id, factuurnummer, leverancier_naam, bedrag_incl, vervaldatum, factuurdatum')
          .eq('status', 'open')
          .eq('huidige_goedkeurder_id', medewerker.id)
          .in('bouw7_status', INKOOP_STATUS_WORKFLOW_LOOPT)
          .order('vervaldatum', { ascending: true, nullsFirst: false })
          .limit(50)
      : Promise.resolve({ data: [] }),

    // Offertes en werkbegrotingen die op mijn oordeel wachten. `gedelegeerd_aan` telt mee:
    // wie het overgedragen kreeg is degene die moet handelen.
    supabase
      .from('goedkeuringen')
      .select('id, object_type, object_id, dossier_id, aangevraagd_op, aangevraagd_door, dossiers:dossier_id (titel, dossiernummer, hoofdstatus, servicedesk_substatus)')
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
  } | null

  const ligtBijJou: GoedkeurenItem[] = []

  for (const f of (inkoopRes.data ?? []) as {
    id: string; factuurnummer: string | null; leverancier_naam: string | null
    bedrag_incl: number | null; vervaldatum: string | null; factuurdatum: string | null
  }[]) {
    ligtBijJou.push({
      id: f.id,
      soort: 'inkoopfactuur',
      titel: f.leverancier_naam ?? f.factuurnummer ?? 'Inkoopfactuur',
      subtitel: [euro(f.bedrag_incl), f.factuurnummer].filter(Boolean).join(' · ') || null,
      href: `/inkoop/facturen?factuur=${f.id}`,
      datum: f.vervaldatum ?? f.factuurdatum,
    })
  }

  for (const g of (openRes.data ?? []) as {
    id: string; object_type: string; object_id: string; dossier_id: string | null
    aangevraagd_op: string; dossiers: DossierRef
  }[]) {
    const d = g.dossiers
    const isWb = g.object_type === 'werkbegroting'
    const seg = d ? sectie(d.hoofdstatus, d.servicedesk_substatus) : null
    ligtBijJou.push({
      id: g.id,
      soort: isWb ? 'werkbegroting' : 'offerte',
      titel: d ? [d.dossiernummer, d.titel].filter(Boolean).join(' — ') : (isWb ? 'Werkbegroting' : 'Offerte'),
      subtitel: isWb ? 'Werkbegroting' : 'Offerte',
      href: isWb
        ? (g.dossier_id && seg ? `/${seg}/${g.dossier_id}/werkbegroting` : null)
        : `/everts-calc/quotes/${g.object_id}/preview`,
      datum: g.aangevraagd_op,
    })
  }

  const afgehandeld: GoedkeurenItem[] = ((afgehandeldRes.data ?? []) as {
    id: string; object_type: string; object_id: string; dossier_id: string | null
    status: string; beoordeeld_op: string | null
    beoordelaar: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null
    dossiers: DossierRef
  }[]).map(g => {
    const d = g.dossiers
    const isWb = g.object_type === 'werkbegroting'
    const seg = d ? sectie(d.hoofdstatus, d.servicedesk_substatus) : null
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
        : `/everts-calc/quotes/${g.object_id}/preview`,
      datum: g.beoordeeld_op,
      akkoord,
    }
  })

  return {
    ligtBijJou,
    afgehandeld,
    inkoopSyncOp,
    aantallen: {
      inkoopfactuur: ligtBijJou.filter(i => i.soort === 'inkoopfactuur').length,
      offerte:       ligtBijJou.filter(i => i.soort === 'offerte').length,
      werkbegroting: ligtBijJou.filter(i => i.soort === 'werkbegroting').length,
    },
  }
}

/**
 * Aantal uurregels dat op jouw fiattering wacht.
 *
 * Apart van `getGoedkeurenWidget` omdat dit wél Bouw7 aanroept: een gepagineerde ophaal over
 * het lopende kwartaal. De widget haalt dit ná het renderen op, zodat de startpagina niet op
 * Bouw7 staat te wachten en gewoon werkt als Bouw7 er even uit ligt.
 */
export async function getUrenTeFiatterenAantal(): Promise<{ aantal: number; fout: string | null }> {
  try {
    const nu = new Date()
    // Lopend kwartaal plus het vorige: verder terug is geen werkvoorraad meer maar archief.
    const van = new Date(nu.getFullYear(), Math.floor(nu.getMonth() / 3) * 3 - 3, 1)
    const dag = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const { getMijnTeKeurenUren } = await import('@/lib/uren/bouw7-goedkeuring')
    const res = await getMijnTeKeurenUren(dag(van), dag(nu))
    if (res.fout) return { aantal: 0, fout: res.fout }
    return { aantal: res.alsTeamleider.length + res.alsProjectleider.length, fout: null }
  } catch (e) {
    return { aantal: 0, fout: e instanceof Error ? e.message : 'Uren konden niet worden opgehaald' }
  }
}
