'use server'

/**
 * mailintake/dossier-kiezen.ts
 *
 * Alles wat het behandelscherm nodig heeft om het juiste dossier en het juiste
 * factuuradres aan te wijzen bij een binnengekomen opdracht.
 *
 * Apart van `actions.ts` omdat dat bestand over de 800 regels ging en dit een
 * samenhangend geheel is: de offertes van de klant, het vrije zoekveld eronder, de
 * poort die zegt of er iets te winnen valt, en de factuuradressen die je dan kunt
 * kiezen. Wie aan het kiezen van een dossier werkt, heeft aan dit bestand genoeg.
 *
 * Zelfde regel als in `actions.ts`: elke functie begint met `vereisRecht`, want de
 * service-role client omzeilt RLS. En geen synchrone exports -- dit is 'use server'.
 */

import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'
import { toetsOfferteDossier } from './opdracht'
import { berekenTermijnschemaUitOfferte } from '@/lib/dossiers/termijnen-bron'

/**
 * De lopende offertes van deze opdrachtgever.
 *
 * Nodig omdat de duplicaatzoeker hier niet voor bedoeld is. Die scoort op sterke
 * signalen -- zelfde conversatie, zelfde bijlage, ons nummer in de tekst -- en geeft
 * een kandidaat zonder zo'n signaal nul punten, waarna hij helemaal afvalt. Voor
 * "bij welke offerte hoort deze opdracht?" is de juiste verzameling gewoon: alle
 * offertes van deze klant. De score bepaalt hooguit de volgorde.
 *
 * Dat verschil kostte de eerste echte opdrachtbon: het bijbehorende dossier stond
 * keurig op verzonden, maar had geen postcode en geen huisnummer, dus er viel niets
 * te scoren en het werd weggegooid.
 */
export async function getOfferteDossiersVoorRelatie(relatieId: string): Promise<
  {
    dossierId: string
    dossiernummer: string | null
    titel: string | null
    substatus: string | null
    aangemaakt: string
    /** Om de lijst op het werkadres van de mail te kunnen sorteren. */
    werkadres: string | null
  }[]
> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()

  const vanaf = new Date()
  vanaf.setMonth(vanaf.getMonth() - 18)

  // De veldenlijst staat er twee keer letterlijk in plaats van in een constante:
  // supabase-js leidt het rijtype uit de string zelf af, en een variabele maakt er
  // `GenericStringError` van.
  const { data } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel, aanvraag_substatus, offerte_substatus, created_at, werkadres_straat, werkadres_huisnummer, werkadres_stad')
    .eq('klant_id', relatieId)
    .eq('hoofdstatus', 'offerte')
    .gte('created_at', vanaf.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  // DE FASE LOOPT NIET ALTIJD MEE MET DE OFFERTE
  // Alleen op `hoofdstatus = 'offerte'` filteren laat de dossiers weg waarvan de
  // offerte al verzonden is terwijl de fase nog op aanvraag staat. Dat was hier
  // precies het geval: bij de opdracht van Van Herk stond 20267.00682 wél in de
  // database met OFT-2026-171 op verzonden, maar niet in deze lijst -- het scherm
  // meldde "nog 2 andere lopende offertes" en het juiste dossier zat daar niet bij.
  // De behandelaar moest het dan met de hand opzoeken zonder te weten waarop.
  const bekend = new Set((data ?? []).map(d => d.id))
  const { data: quotes } = await supabase
    .from('quotes').select('dossier_id')
    .eq('status', 'verzonden')
    .not('dossier_id', 'is', null)
    .limit(500)
  const metOfferte = [...new Set((quotes ?? [])
    .map(q => q.dossier_id).filter(id => id && !bekend.has(id)) as string[])]

  let achterlopers: typeof data = []
  if (metOfferte.length) {
    const { data: extra } = await supabase
      .from('dossiers')
      .select('id, dossiernummer, titel, aanvraag_substatus, offerte_substatus, created_at, werkadres_straat, werkadres_huisnummer, werkadres_stad')
      .eq('klant_id', relatieId)
      .eq('hoofdstatus', 'aanvraag')
      .in('id', metOfferte)
      .gte('created_at', vanaf.toISOString())
      .order('created_at', { ascending: false })
      .limit(50)
    achterlopers = extra ?? []
  }

  return [...(data ?? []), ...achterlopers].map(d => ({
    dossierId: d.id,
    dossiernummer: d.dossiernummer ?? null,
    titel: d.titel ?? null,
    // Een achterloper toont zijn eigen stand, niet een offertestatus die er niet is.
    substatus: d.offerte_substatus ?? (d.aanvraag_substatus ? `aanvraag · ${d.aanvraag_substatus}` : null),
    aangemaakt: d.created_at,
    werkadres: [d.werkadres_straat, d.werkadres_huisnummer, d.werkadres_stad, d.titel]
      .filter(Boolean).join(' ') || null,
  }))
}

/**
 * Zoekt een dossier om een bericht aan te koppelen.
 *
 * Zoekt op dossier-/offertenummer, op titel en op werkadres. Dat nummer is het punt:
 * `zoekDossiers` kijkt alleen naar de titel, dus wie het offertenummer uit de mail
 * overtikte vond niets. Er wordt ook op alleen de cijfers gezocht, want klanten
 * schrijven ons nummer zelden over zoals wij het noteren -- "20267.00748",
 * "2026700748" en "offerte 748" horen hetzelfde dossier te vinden.
 */
export async function zoekDossierVoorIntake(term: string): Promise<
  {
    dossierId: string
    dossiernummer: string | null
    titel: string | null
    hoofdstatus: string | null
    substatus: string | null
    klantnaam: string | null
    werkadres: string | null
  }[]
> {
  await vereisRecht('mailintake', 'lezen')
  const zoek = term.trim()
  if (zoek.length < 2) return []

  const supabase = createAdminClient()
  const SELECT =
    'id, dossiernummer, titel, hoofdstatus, aanvraag_substatus, offerte_substatus, ' +
    'opdracht_substatus, werkadres_straat, werkadres_huisnummer, werkadres_stad, ' +
    'klant:relaties!dossiers_klant_id_fkey(naam)'

  // Twee losse queries in plaats van een `or` met een gebruikerswaarde erin: een
  // PostgREST-filterstring is geen plek voor vrije invoer.
  const veilig = zoek.replace(/[^A-Za-z0-9.\- ]/g, '').slice(0, 60)
  const cijfers = veilig.replace(/\D/g, '')

  const [opNummer, opTekst] = await Promise.all([
    cijfers.length >= 3
      ? supabase.from('dossiers').select(SELECT).ilike('dossiernummer', `%${cijfers}%`).limit(15)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('dossiers').select(SELECT)
      .or(`titel.ilike.%${veilig}%,werkadres_straat.ilike.%${veilig}%`)
      .limit(15),
  ])

  const gezien = new Set<string>()
  const uit: Awaited<ReturnType<typeof zoekDossierVoorIntake>> = []
  for (const rij of [...(opNummer.data ?? []), ...(opTekst.data ?? [])] as Record<string, unknown>[]) {
    const id = String(rij.id)
    if (gezien.has(id)) continue
    gezien.add(id)
    const klant = rij.klant as { naam?: string } | null
    uit.push({
      dossierId: id,
      dossiernummer: (rij.dossiernummer as string) ?? null,
      titel: (rij.titel as string) ?? null,
      hoofdstatus: (rij.hoofdstatus as string) ?? null,
      substatus: (rij.opdracht_substatus ?? rij.offerte_substatus ?? rij.aanvraag_substatus) as string ?? null,
      klantnaam: klant?.naam ?? null,
      werkadres: [rij.werkadres_straat, rij.werkadres_huisnummer, rij.werkadres_stad]
        .filter(Boolean).join(' ') || null,
    })
  }
  return uit.slice(0, 20)
}

/** Kan deze offerte gewonnen worden? Voor de knop in het behandelscherm. */
export async function toetsOfferteVoorOpdracht(dossierId: string): Promise<
  Awaited<ReturnType<typeof toetsOfferteDossier>>
> {
  await vereisRecht('mailintake', 'lezen')
  return toetsOfferteDossier(dossierId)
}

/**
 * Welke verkooptermijnen er uit de offerte zouden volgen — zonder ze aan te maken.
 *
 * Voedt het termijnenblok in het behandelscherm. Tot nu toe draaide het aanmaken
 * blind ná de statuswissel, en bleek pas achteraf dat het niet kon; dan stond er al
 * een gewonnen opdracht zonder termijnen en kwam er een actie voor de projectleider.
 * Nu staat vóór de bevestiging op het scherm wat er gaat gebeuren, of in gewone taal
 * waarom het niet lukt.
 *
 * Leest alleen: de schrijfstap zit in `maakTermijnschemaUitOfferte` en blijft lopen
 * waar hij liep.
 */
export async function getTermijnvoorstelVoorIntake(
  dossierId: string,
): Promise<Awaited<ReturnType<typeof berekenTermijnschemaUitOfferte>>> {
  await vereisRecht('mailintake', 'lezen')
  return berekenTermijnschemaUitOfferte(dossierId)
}

/** Factuuradressen van een relatie, voor de controle bij een opdracht. */
export async function getFactuuradressenVoorIntake(relatieId: string): Promise<
  { id: string; label: string; straat: string | null; postcode: string | null; plaats: string | null }[]
> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('relatie_factuuradressen')
    .select('id, label, straat, postcode, plaats')
    .eq('relatie_id', relatieId)
    .order('label')
    .limit(50)
  return data ?? []
}

/**
 * Legt een afwijkend factuuradres vast bij de opdrachtgever en geeft het id terug.
 * De opdrachtgever zelf verandert niet -- alleen het adres waar de factuur heen gaat.
 */
export async function bewaarFactuuradresVoorIntake(
  relatieId: string,
  adres: { label: string; straat: string; postcode: string; plaats: string },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()
  const label = adres.label.trim() || 'Factuuradres'
  const { data, error } = await supabase
    .from('relatie_factuuradressen')
    .insert({
      relatie_id: relatieId,
      label,
      straat: adres.straat.trim() || null,
      postcode: adres.postcode.trim() || null,
      plaats: adres.plaats.trim() || null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}
