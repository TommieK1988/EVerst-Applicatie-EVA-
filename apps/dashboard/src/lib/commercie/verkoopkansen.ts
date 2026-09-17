'use server'

/**
 * Server-actions voor verkoopkansen: wat er overblijft als een offerte verloren gaat, vervalt
 * of wordt uitgesteld.
 *
 * Een eigen module en niet een hoofdstuk in `actions.ts`, om twee redenen. De verkoopkans is
 * een andere entiteit dan de offertekaart — hij hangt niet aan één dossier maar verwijst
 * ernaar — en `actions.ts` was met dit hoofdstuk erbij over de 800 regels gegaan, wat de
 * schuldteller (terecht) afkeurde.
 *
 * Pure helpers die beide modules delen (`naamVan`, `vertaalDbFout`, `ActieResultaat`) staan in
 * `types.ts`: een `'use server'`-module mag alleen async functies exporteren, dus ze konden
 * niet vanuit `actions.ts` komen.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, type CurrentMedewerker } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { objectAdresRegel } from '@/lib/objecten/adres'
import {
  verkoopkansCompleet, naamVan, vertaalDbFout,
  type ActieResultaat, type MedewerkerNaam, type Verkoopkans, type VerkoopkansInvoer,
} from './types'

/** De service-role-client; los getypeerd zodat de helpers hieronder hem kunnen aannemen. */
type AdminClient = ReturnType<typeof createAdminClient>

/**
 * De kans die overblijft als een offerte verloren gaat, vervalt of wordt uitgesteld.
 *
 * Technisch een rij in dezelfde tabel als de offertekaart (`soort = 'signaal'`, zonder
 * `dossier_id` maar met `bron_dossier_id`); zie `lib/commercie/types.ts` en de migratie
 * `20260917a_verkoopkansen.sql` voor waarom dat geen tweede tabel is geworden.
 *
 * De drie verplichte velden landen zo: uitleg → `titel` én `stap_tekst`, actiehouder →
 * `actiehouder_id`, deadline → `stap_datum`. Dat `stap_tekst` de uitleg herhaalt is geen
 * slordigheid maar het schema: een kaart met een stap moet van de check-constraint een tekst,
 * een datum én een houder hebben, en de uitleg ís hier de afspraak.
 */
async function schrijfVerkoopkans(
  supabase: AdminClient,
  medewerker: CurrentMedewerker,
  invoer: VerkoopkansInvoer,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const uitleg = invoer.uitleg.trim()
  const { data, error } = await supabase.from('commercie_bewaking')
    .insert({
      soort: 'signaal',
      titel: uitleg,
      bron_dossier_id: invoer.bronDossierId ?? null,
      relatie_id: await klantVoorKans(supabase, invoer),
      object_id: await objectVoorKans(supabase, invoer),
      eigenaar_id: medewerker.id,
      actiehouder_id: invoer.actiehouderId,
      stap_soort: 'actie',
      stap_tekst: uitleg,
      stap_datum: invoer.deadline,
      stap_bron: 'handmatig',
      // Een kans die iemand bewust vastlegt is per definitie beoordeeld; bleef dit leeg, dan
      // zou hij zichzelf als "nog niet beoordeeld" tonen.
      getrieerd_op: new Date().toISOString(),
      getrieerd_door: medewerker.id,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: vertaalDbFout(error?.message ?? 'onbekende fout') }
  return { ok: true, id: data.id }
}

/**
 * De klant die bij deze kans hoort.
 *
 * Wie er zelf een kiest, krijgt die. Doet niemand dat maar komt de kans uit een dossier, dan
 * nemen we de opdrachtgever van dat dossier over. Dat scheelt een keuze op het moment dat je
 * net een offerte aan het afsluiten bent, en het maakt de kans meteen vindbaar op klantnaam —
 * zonder deze terugval zou elke kans uit de afsluitdialoog klantloos blijven.
 */
async function klantVoorKans(
  supabase: AdminClient,
  invoer: VerkoopkansInvoer,
): Promise<string | null> {
  if (invoer.relatieId) return invoer.relatieId
  if (!invoer.bronDossierId) return null
  const { data } = await supabase.from('dossiers')
    .select('klant_id').eq('id', invoer.bronDossierId).maybeSingle()
  return data?.klant_id ?? null
}

/** Zelfde terugval als bij de klant, maar dan voor het object van het brondossier. */
async function objectVoorKans(
  supabase: AdminClient,
  invoer: VerkoopkansInvoer,
): Promise<string | null> {
  if (invoer.objectId) return invoer.objectId
  if (!invoer.bronDossierId) return null
  const { data } = await supabase.from('dossiers')
    .select('object_id').eq('id', invoer.bronDossierId).maybeSingle()
  return data?.object_id ?? null
}

export async function maakVerkoopkans(invoer: VerkoopkansInvoer): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  if (!verkoopkansCompleet(invoer)) {
    return { ok: false, error: 'Vul de uitleg, de actiehouder en de deadline in.' }
  }
  const supabase = createAdminClient()
  const res = await schrijfVerkoopkans(supabase, medewerker, invoer)
  if (!res.ok) return res

  if (invoer.actiehouderId !== medewerker.id) {
    await meldVerkoopkansActiehouder(supabase, {
      actiehouderId: invoer.actiehouderId,
      uitleg: invoer.uitleg.trim(),
      deadline: invoer.deadline,
      bronDossierId: invoer.bronDossierId ?? null,
    })
  }

  revalidatePath('/aanvragen')
  return { ok: true }
}

/** Bewerken vanuit het overzicht: dezelfde drie velden, plus afronden. */
export async function wijzigVerkoopkans(
  id: string,
  invoer: VerkoopkansInvoer & { afgerond?: boolean; afgerondReden?: string | null },
): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  if (!verkoopkansCompleet(invoer)) {
    return { ok: false, error: 'Vul de uitleg, de actiehouder en de deadline in.' }
  }
  const supabase = createAdminClient()

  const { data: bestaand } = await supabase.from('commercie_bewaking')
    .select('id,soort,afgerond_op').eq('id', id).maybeSingle()
  if (!bestaand || bestaand.soort !== 'signaal') {
    return { ok: false, error: 'Deze verkoopkans bestaat niet meer.' }
  }

  const uitleg = invoer.uitleg.trim()
  const { error } = await supabase.from('commercie_bewaking')
    .update({
      titel: uitleg,
      stap_tekst: uitleg,
      stap_datum: invoer.deadline,
      actiehouder_id: invoer.actiehouderId,
      bron_dossier_id: invoer.bronDossierId ?? null,
      // Hier bewust géén terugval op het dossier: wie de klant of het object leegmaakt,
      // bedoelt dat.
      relatie_id: invoer.relatieId ?? null,
      object_id: invoer.objectId ?? null,
      // Afronden en heropenen zijn dezelfde knop: een kans die per ongeluk is afgevinkt moet
      // terug kunnen zonder dat iemand hem opnieuw moet intypen. Het oorspronkelijke moment
      // blijft staan zodra hij er is, zodat heropenen-en-weer-afronden de datum niet verschuift.
      afgerond_op: invoer.afgerond ? (bestaand.afgerond_op ?? new Date().toISOString()) : null,
      afgerond_door: invoer.afgerond ? medewerker.id : null,
      afgerond_reden: invoer.afgerond ? (invoer.afgerondReden?.trim() || null) : null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: vertaalDbFout(error.message) }
  revalidatePath('/aanvragen')
  return { ok: true }
}

/** Stil bij fouten — zie maak.ts; een mislukte melding mag de kans niet tegenhouden. */
async function meldVerkoopkansActiehouder(
  supabase: AdminClient,
  opts: { actiehouderId: string; uitleg: string; deadline: string; bronDossierId: string | null },
): Promise<void> {
  const { data: mw } = await supabase.from('medewerkers')
    .select('auth_user_id').eq('id', opts.actiehouderId).maybeSingle()
  if (!mw?.auth_user_id) return

  await maakNotificatie({
    user_id: mw.auth_user_id,
    type: 'offertebewaking',
    titel: 'Verkoopkans voor jou',
    body: `${opts.uitleg} · uiterlijk ${opts.deadline}`,
    url: '/aanvragen',
    dossier_id: opts.bronDossierId ?? undefined,
  })
}

/**
 * Alle verkoopkansen. Gepagineerd omdat dit geen per-dossier-query is: de lijst groeit met elke
 * verloren offerte en zou stil op 1000 rijen worden afgekapt.
 *
 * De brondossiers komen in een tweede ronde in plaats van via een PostgREST-embed:
 * `commercie_bewaking` heeft twee verwijzingen naar `dossiers` (`dossier_id` en
 * `bron_dossier_id`), en een embed moet dan op FK-naam worden gekozen — een naam die bij een
 * toekomstige migratie kan wijzigen zonder dat iets faalt tot het scherm leeg blijft.
 */
export async function getVerkoopkansen(): Promise<Verkoopkans[]> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = createAdminClient()

  type SignaalRij = {
    id: string
    titel: string | null
    actiehouder_id: string | null
    stap_datum: string | null
    bron_dossier_id: string | null
    relatie_id: string | null
    object_id: string | null
    afgerond_op: string | null
    afgerond_reden: string | null
    created_at: string
  }
  type DossierMini = {
    id: string
    dossiernummer: string | null
    titel: string | null
    hoofdstatus: string | null
    klant_id: string | null
  }
  type ObjectMini = {
    id: string
    naam: string | null
    objectnummer: string | null
    adres_straat: string | null
    adres_huisnummer: string | null
    adres_postcode: string | null
    adres_plaats: string | null
  }

  const rijen = await haalAlleRijen<SignaalRij>((van, tot) =>
    supabase.from('commercie_bewaking')
      .select('id,titel,actiehouder_id,stap_datum,bron_dossier_id,relatie_id,object_id,afgerond_op,afgerond_reden,created_at')
      .eq('soort', 'signaal')
      .order('id')
      .range(van, tot),
  )

  if (rijen.length === 0) return []

  const dossierIds = [...new Set(rijen.map(r => r.bron_dossier_id).filter(Boolean) as string[])]
  const medewerkerIds = [...new Set(rijen.map(r => r.actiehouder_id).filter(Boolean) as string[])]

  // Beide begrensd met `.in()` op de ids die we net hebben — ruim onder de PostgREST-grens.
  const [dossierRes, mensenRes] = await Promise.all([
    dossierIds.length
      ? supabase.from('dossiers').select('id,dossiernummer,titel,hoofdstatus,klant_id').in('id', dossierIds)
      : Promise.resolve({ data: [] as DossierMini[] }),
    medewerkerIds.length
      ? supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', medewerkerIds)
      : Promise.resolve({ data: [] as MedewerkerNaam[] }),
  ])
  const dossiers = (dossierRes.data ?? []) as DossierMini[]
  const mensen = (mensenRes.data ?? []) as MedewerkerNaam[]

  // Zowel de eigen klant van de kans als die van het brondossier, in één ronde: oudere kansen
  // (van vóór `relatie_id`) hebben alleen het dossier om op terug te vallen.
  const klantIds = [...new Set([
    ...rijen.map(r => r.relatie_id),
    ...dossiers.map(d => d.klant_id),
  ].filter(Boolean) as string[])]
  const relatieRes = klantIds.length
    ? await supabase.from('relaties').select('id, naam').in('id', klantIds)
    : { data: [] as { id: string; naam: string | null }[] }

  const objectIds = [...new Set(rijen.map(r => r.object_id).filter(Boolean) as string[])]
  const objectRes = objectIds.length
    ? await supabase.from('vastgoed_objecten')
        .select('id, naam, objectnummer, adres_straat, adres_huisnummer, adres_postcode, adres_plaats')
        .in('id', objectIds)
    : { data: [] as ObjectMini[] }

  const klantPerId = new Map((relatieRes.data ?? []).map(r => [r.id, r.naam ?? null]))
  const dossierPerId = new Map(dossiers.map(d => [d.id, d]))
  const naamPerId = new Map(mensen.map(m => [m.id, naamVan(m)]))
  const objectPerId = new Map(
    ((objectRes.data ?? []) as ObjectMini[]).map(o => [o.id, objectOmschrijving(o)]),
  )

  return rijen
    .map<Verkoopkans>(r => {
      const d = r.bron_dossier_id ? dossierPerId.get(r.bron_dossier_id) ?? null : null
      const fase = d?.hoofdstatus
      return {
        id: r.id,
        uitleg: r.titel ?? '',
        actiehouderId: r.actiehouder_id,
        actiehouderNaam: r.actiehouder_id ? naamPerId.get(r.actiehouder_id) ?? null : null,
        deadline: r.stap_datum,
        bronDossierId: r.bron_dossier_id,
        bronDossiernummer: d?.dossiernummer ?? null,
        bronDossierTitel: d?.titel ?? null,
        bronSectie: fase === 'aanvraag' || fase === 'offerte' || fase === 'opdracht' ? fase : null,
        relatieId: r.relatie_id,
        // De eigen klant wint; het dossier is de terugval voor kansen van vóór `relatie_id`.
        klantNaam:
          (r.relatie_id ? klantPerId.get(r.relatie_id) : null)
          ?? (d?.klant_id ? klantPerId.get(d.klant_id) ?? null : null),
        objectId: r.object_id,
        objectNaam: r.object_id ? objectPerId.get(r.object_id) ?? null : null,
        afgerondOp: r.afgerond_op,
        afgerondReden: r.afgerond_reden,
        aangemaaktOp: r.created_at,
      }
    })
    // Open kansen eerst, daarbinnen de dichtstbijzijnde deadline bovenaan: dat is de volgorde
    // waarin je ze afwerkt, niet de volgorde waarin ze zijn ontstaan.
    .sort((a, b) => {
      if (!!a.afgerondOp !== !!b.afgerondOp) return a.afgerondOp ? 1 : -1
      return (a.deadline ?? '9999') < (b.deadline ?? '9999') ? -1 : 1
    })
}

/**
 * Eén regel die een object herkenbaar maakt: naam, en daarachter het adres wanneer dat iets
 * toevoegt. Objecten heten vaak "Complex 1013" — zonder straat en plaats zegt dat niemand iets.
 * Het adres komt uit `objectAdresRegel`, dezelfde opmaak als de objectenlijst en de kiezer.
 */
function objectOmschrijving(o: {
  naam: string | null
  objectnummer: string | null
  adres_straat: string | null
  adres_huisnummer: string | null
  adres_postcode: string | null
  adres_plaats: string | null
}): string {
  const kop = o.naam || o.objectnummer || 'Object'
  const adres = objectAdresRegel(o)
  return adres ? `${kop} · ${adres}` : kop
}
