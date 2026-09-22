'use server'

/**
 * mailintake/actions.ts
 *
 * De server actions achter het postvak en het behandelscherm.
 *
 * Alles hier begint met `vereisRecht('mailintake', ...)`. Deze module gebruikt de
 * service-role client, die RLS omzeilt; zonder die controle zou elke ingelogde
 * sessie — ook een klantportaal-gebruiker — bij de post van het bedrijf kunnen.
 *
 * Let op: in een 'use server'-module mag niets synchroons worden geëxporteerd.
 * Typen en constanten staan daarom in ./types en ./nabehandeling.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

import { vereisRecht, getCurrentMedewerker } from '@/lib/auth/rechten'
import { toetsPostbus } from '@/lib/o365/inbox'
import { zetOfferteGewonnenUitBericht, toetsOfferteDossier } from './opdracht'

import { maakDossierUitBericht, koppelAanDossier, onthoudAlias } from './aanmaken'
import { proefAanmaak } from './proef'
import { haalPostbusOp } from './ophalen'
import { verwerkBericht } from './verwerken'
import { maakWerkzaamhedenSamenvatting } from './werkzaamheden-uitvoeren'
import { voerNabehandelingUit, planNabehandeling } from './nabehandeling'
import type { GekeurdeVelden } from './extractie'
import type { PostbusPatch } from './types'
import type { DossierFase } from '@/components/dossiers/fase-plaatsing'

/** Kortlopende downloadlink voor één bijlage uit de privébucket. */
export async function getBijlageUrl(bijlageId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_bijlagen').select('opslag_pad, bestandsnaam').eq('id', bijlageId).maybeSingle()
  if (!b?.opslag_pad) return { ok: false, error: 'Deze bijlage is niet opgeslagen (te groot of niet gelukt).' }

  const { data, error } = await supabase.storage.from('mail-intake').createSignedUrl(b.opslag_pad, 300)
  if (error || !data?.signedUrl) return { ok: false, error: 'Kon geen downloadlink maken.' }
  return { ok: true, url: data.signedUrl }
}

// ─── Behandelen ───────────────────────────────────────────────────────────────

/**
 * De proef: laat zien wat er zou gebeuren en schrijft niets.
 *
 * Draait vóór het akkoord, zodat de bevestiging over het werkelijke voorstel gaat
 * en niet over een benadering ervan. Hetzelfde resultaat gaat daarna mee naar
 * `maakDossierVanBericht`, want dat is waartegen er wordt teruggelezen.
 */
export async function proefDossierVanBericht(
  berichtId: string,
  velden: GekeurdeVelden & {
    relatieId: string | null
    contactpersoonId: string | null
    /** Waar het dossier heen moet; bepaalt de plaatsing in het voorstel. */
    fase?: DossierFase
  },
  omschrijving: { scope: string | null; buitenScope: string | null; aandachtspunten: string | null },
) {
  await vereisRecht('mailintake', 'lezen')
  return proefAanmaak(berichtId, velden, omschrijving, velden.fase ?? 'aanvraag')
}

/**
 * Maakt een dossier aan vanuit het behandelscherm.
 *
 * De duplicaatcontrole is hier bewust géén blokkade: het scherm heeft de
 * kandidaten al getoond en de gebruiker heeft de bevestigingsdialoog gezien.
 * Wat we wél doen is vastleggen dát er een waarschuwing stond, zodat achteraf
 * te zien is hoe vaak er langs een terechte waarschuwing is gewerkt.
 */
export async function maakDossierVanBericht(
  berichtId: string,
  velden: GekeurdeVelden & {
    relatieId: string
    contactpersoonId: string | null
    objectId?: string | null
    gevraagdeWerkzaamheden?: string | null
    buitenScope?: string | null
    aandachtspunten?: string | null
    /** De calculator, als die bij de intake al is aangewezen. */
    calculatorId?: string | null
    /** Een eerste actie op het nieuwe dossier. */
    actie?: { titel: string; medewerkerId: string | null; dagen: number } | null
    /** Waar het dossier terechtkomt: aanvraag, opdracht of servicedesk. */
    fase?: DossierFase
  },
  /** Het voorstel uit de proef; waartegen er na het aanmaken wordt teruggelezen. */
  proef?: Awaited<ReturnType<typeof proefAanmaak>>,
): Promise<{
  ok: boolean
  dossierId?: string
  dossiernummer?: string | null
  bouw7Ok?: boolean
  bouw7Fout?: string
  /** Verschillen tussen het voorstel en wat er na het aanmaken werkelijk staat. */
  afwijkingen?: { veld: string; verstuurd: string | null; teruggelezen: string | null }[]
  /** false = er week iets af, dus de bestanden staan nog klaar in plaats van in de map. */
  bestandenGeplaatst?: boolean
  error?: string
}> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: bericht } = await supabase
    .from('mailintake_berichten')
    .select('id, status, van_adres, duplicaat_topscore, postbus:mailintake_postbussen(standaard_behandelaar_id)')
    .eq('id', berichtId)
    .maybeSingle()
  if (!bericht) return { ok: false, error: 'Bericht niet gevonden.' }
  if (bericht.status === 'verwerkt') return { ok: false, error: 'Dit bericht is al afgehandeld.' }

  const res = await maakDossierUitBericht({
    berichtId,
    relatieId: velden.relatieId,
    contactpersoonId: velden.contactpersoonId,
    velden,
    objectId: velden.objectId ?? null,
    gevraagdeWerkzaamheden: velden.gevraagdeWerkzaamheden ?? null,
    omschrijving: {
      scope: velden.gevraagdeWerkzaamheden ?? null,
      buitenScope: velden.buitenScope ?? null,
      aandachtspunten: velden.aandachtspunten ?? null,
    },
    proef,
    fase: velden.fase ?? 'aanvraag',
    calculatorId: velden.calculatorId ?? null,
    actie: velden.actie ?? null,
    automatisch: false,
    medewerkerId: medewerker.id,
    behandelaarId: (bericht.postbus as { standaard_behandelaar_id: string | null } | null)?.standaard_behandelaar_id ?? null,
  })

  if (!res.ok) return { ok: false, error: res.error }

  if ((bericht.duplicaat_topscore ?? 0) >= 0.55) {
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
      actie: 'duplicaatwaarschuwing_genegeerd',
      details: { topscore: bericht.duplicaat_topscore, dossier_id: res.dossierId },
    })
  }

  // Het leergeheugen: deze keuze maakt de herkenning de volgende keer sterker.
  await onthoudAlias({
    adres: bericht.van_adres,
    relatieId: velden.relatieId,
    contactpersoonId: velden.contactpersoonId,
    medewerkerId: medewerker.id,
  }).catch(() => {})

  revalidatePath('/mailintake')
  return {
    ok: true, dossierId: res.dossierId, dossiernummer: res.dossiernummer,
    bouw7Ok: res.bouw7Ok, bouw7Fout: res.bouw7Fout,
    afwijkingen: res.afwijkingen ?? [],
    bestandenGeplaatst: res.bestandenGeplaatst !== false,
  }
}

/**
 * Zet de offerte op gewonnen en maakt de opdracht compleet.
 *
 * LET OP het rechtenverschil: deze action vraagt `mailintake:schrijven`, en
 * verandert daarmee de fase van een dossier en de projectstatus in Bouw7 --
 * handelingen die op het dossierscherm zelf achter `dossiers:schrijven` zitten.
 * Dat is bewust: dit is de handeling waarvoor de knop bestaat. Wie de mailintake
 * mag behandelen, mag een binnengekomen opdracht verwerken.
 */
/**
 * Het werkadres uit de laatst gekeurde lezing van dit bericht.
 *
 * Los omdat de opdrachtroute geen adresformulier heeft: het adres komt van de
 * offerte. Wat de mail erover zegt is aanvulling -- meestal wie je ter plaatse moet
 * hebben, en dat is precies wat er in het dossier ontbrak.
 */
async function leesWerkadresUitLezing(berichtId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_extracties')
    .select('gekeurde_velden')
    .eq('bericht_id', berichtId)
    .eq('ronde', 'velden')
    .not('gekeurde_velden', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const v = (data?.gekeurde_velden ?? null) as Record<string, unknown> | null
  if (!v) return null
  const tekst = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : null)
  return {
    werkadres: {
      straat: tekst('werkadresStraat'),
      huisnummer: tekst('werkadresHuisnummer'),
      postcode: tekst('werkadresPostcode'),
      stad: tekst('werkadresStad'),
      naam: tekst('werkadresNaam'),
      telefoon: tekst('werkadresTelefoon'),
      email: tekst('werkadresEmail'),
    },
    betrokkenen: Array.isArray(v.betrokkenen)
      ? (v.betrokkenen as { naam: string; rol: string | null; email: string | null; telefoon: string | null }[])
      : [],
  }
}

export async function bevestigOpdrachtOpDossier(
  berichtId: string,
  dossierId: string,
  invoer?: {
    opdrachtReferentie?: string | null
    opdrachtdatum?: string | null
    klantOpmerkingen?: string | null
    factuuradresId?: string | null
    /** Zet de herkende contactpersoon ook op het dossier. */
    contactpersoonOpDossier?: boolean
    /** Afrekenen op nacalculatie: geen aanneemsom naar Bouw7. */
    regie?: boolean
    /** Alleen na een expliciete tweede klik bij een Bouw7-conflict. */
    forceerBouw7?: boolean
  },
): Promise<{
  ok: boolean
  error?: string
  conflict?: { bouw7Label: string }
  dossiernummer?: string | null
  nazorg?: { termijnen: string; termijnenReden?: string; bijlagen: number; notitie: boolean }
}> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: bericht } = await supabase
    .from('mailintake_berichten')
    .select('id, status, relatie_id, contactpersoon_id, ontvangen_op, postbus:mailintake_postbussen(standaard_behandelaar_id)')
    .eq('id', berichtId)
    .maybeSingle()
  if (!bericht) return { ok: false, error: 'Bericht niet gevonden.' }
  if (bericht.status === 'verwerkt') return { ok: false, error: 'Dit bericht is al afgehandeld.' }

  const uitLezing = await leesWerkadresUitLezing(berichtId)

  const res = await zetOfferteGewonnenUitBericht({
    berichtId,
    dossierId,
    medewerkerId: medewerker.id,
    behandelaarId: (bericht.postbus as { standaard_behandelaar_id: string | null } | null)?.standaard_behandelaar_id ?? null,
    opdrachtReferentie: invoer?.opdrachtReferentie ?? null,
    opdrachtdatum: invoer?.opdrachtdatum ?? bericht.ontvangen_op?.slice(0, 10) ?? null,
    klantOpmerkingen: invoer?.klantOpmerkingen ?? null,
    factuuradresId: invoer?.factuuradresId,
    contactpersoonOpDossier: invoer?.contactpersoonOpDossier === true,
    regie: invoer?.regie === true,
    relatieId: bericht.relatie_id,
    contactpersoonId: bericht.contactpersoon_id,
    forceerBouw7: invoer?.forceerBouw7 === true,
    // Uit de gekeurde lezing en niet uit het scherm: het opdrachtpaneel toont geen
    // adresvelden -- het adres komt van de offerte. Wat de mail erover zegt vult
    // alleen aan wat leeg was, meestal wie je ter plaatse moet hebben.
    werkadres: uitLezing?.werkadres ?? null,
    betrokkenen: uitLezing?.betrokkenen ?? [],
  })

  revalidatePath('/mailintake')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  return res
}

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

  const { data } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel, offerte_substatus, created_at, werkadres_straat, werkadres_huisnummer, werkadres_stad')
    .eq('klant_id', relatieId)
    .eq('hoofdstatus', 'offerte')
    .gte('created_at', vanaf.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  return (data ?? []).map(d => ({
    dossierId: d.id,
    dossiernummer: d.dossiernummer ?? null,
    titel: d.titel ?? null,
    substatus: d.offerte_substatus ?? null,
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

export async function koppelBerichtAanDossier(
  berichtId: string,
  dossierId: string,
  besluit: 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen' = 'gekoppeld_bestaand',
): Promise<{ ok: boolean; error?: string; melding?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')

  // ── Meerwerk raakt de meerwerkregels, niet alleen het bericht ──
  // Dit deed tot nu toe niets meer dan de mail aan het dossier hangen met het
  // woord "meerwerk" erbij; op het Meerwerk-tabblad veranderde er niets. Vóór het
  // koppelen, zodat een weigering (verkeerde fase, ongeldige overgang) het bericht
  // niet al als afgehandeld achterlaat.
  let melding: string | undefined
  if (besluit === 'meerwerk') {
    const { data: b } = await createAdminClient()
      .from('mailintake_berichten')
      .select('postbus:mailintake_postbussen(standaard_behandelaar_id)')
      .eq('id', berichtId)
      .maybeSingle()

    const { zetMeerwerkAkkoordUitBericht } = await import('./meerwerk')
    const res = await zetMeerwerkAkkoordUitBericht({
      berichtId,
      dossierId,
      behandelaarId:
        (b?.postbus as { standaard_behandelaar_id: string | null } | null)?.standaard_behandelaar_id
        ?? medewerker.id,
    })

    if (!res.ok) return { ok: false, error: res.fout }
    melding =
      res.soort === 'akkoord'
        ? `Meerwerk "${res.omschrijving}" staat op akkoord.`
        : res.soort === 'geen_regel'
          ? `Er stond geen meerwerkregel open; ${res.taakVoor ?? 'de projectleider'} krijgt een actie om er een aan te maken.`
          : `Er staan ${res.aantal} meerwerkregels open; ${res.taakVoor ?? 'de projectleider'} krijgt een actie om de juiste aan te wijzen.`
  }

  await koppelAanDossier(berichtId, dossierId, medewerker.id, besluit)
  revalidatePath('/mailintake')
  return { ok: true, melding }
}

/**
 * Negeren is een menselijk besluit: de mail gaat daarna uit Postvak IN.
 * De reden is verplicht — anders is achteraf niet na te gaan waarom een bericht
 * van een bekende klant is weggezet.
 */
export async function negeerBericht(berichtId: string, reden: string): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const tekst = (reden ?? '').trim()
  if (tekst.length < 2) return { ok: false, error: 'Geef kort aan waarom dit genegeerd kan worden.' }

  await supabase.from('mailintake_berichten').update({
    status: 'genegeerd', besluit: 'genegeerd',
    behandeld_door: medewerker.id, behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'genegeerd', details: { reden: tekst },
  })

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
  revalidatePath('/mailintake')
  return { ok: true }
}

/** Zet een bericht terug op de werkvoorraad; het tegenovergestelde van negeren. */
export async function heropenBericht(berichtId: string): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten').select('status, dossier_id').eq('id', berichtId).maybeSingle()
  if (!b) return { ok: false, error: 'Bericht niet gevonden.' }
  if (b.dossier_id) return { ok: false, error: 'Aan dit bericht hangt al een dossier.' }

  // Terug naar `nieuw` en niet rechtstreeks naar `wacht_op_mens`: jij zegt dat het
  // werk is, dus EVA hoort het opnieuw te lezen en dít keer door te zoeken tot hij
  // weet wát het is. Ging het naar Te behandelen zonder herlezing, dan kreeg je een
  // leeg formulier voorgeschoteld -- precies het bericht dat hij eerder wegzette.
  //
  // `mens_zegt_werk` blijft daarna staan. Hij dwingt bij elke volgende ronde dat de
  // ruis-uitgang dicht is; zonder die vlag komt het model tot hetzelfde oordeel en
  // staat het bericht een minuut later weer in het archief.
  const uitArchief = b.status === 'geen_aanvraag'
  await supabase.from('mailintake_berichten').update({
    status: uitArchief ? 'nieuw' : 'wacht_op_mens',
    besluit: null, behandeld_door: null, behandeld_op: null,
    pogingen: 0, laatste_fout: null,
    ...(uitArchief ? { mens_zegt_werk: true } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'heropend',
    details: { vorige_status: b.status, opnieuw_lezen: uitArchief },
  })

  revalidatePath('/mailintake')
  return { ok: true }
}

export async function markeerGeenAanvraag(berichtId: string, reden: string): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  await supabase.from('mailintake_berichten').update({
    status: 'geen_aanvraag', besluit: 'geen_aanvraag',
    behandeld_door: medewerker.id, behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'geen_aanvraag', details: { reden: (reden ?? '').trim() || null },
  })

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
  revalidatePath('/mailintake')
  return { ok: true }
}

export async function wijsBerichtToe(berichtId: string, medewerkerId: string | null): Promise<{ ok: boolean }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()
  await supabase.from('mailintake_berichten')
    .update({ toegewezen_medewerker_id: medewerkerId, updated_at: new Date().toISOString() })
    .eq('id', berichtId)
  revalidatePath('/mailintake')
  return { ok: true }
}

/** Laat de AI het bericht opnieuw lezen (nieuwe extractieversie). */
export async function leesOpnieuw(berichtId: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: b } = await supabase.from('mailintake_berichten').select('dossier_id').eq('id', berichtId).maybeSingle()
  if (b?.dossier_id) return { ok: false, error: 'Aan dit bericht hangt al een dossier.' }

  await supabase.from('mailintake_berichten')
    .update({ status: 'nieuw', pogingen: 0, laatste_fout: null, updated_at: new Date().toISOString() })
    .eq('id', berichtId)

  // Eerst de bijlagen bijwerken, dan pas herlezen. Een bericht van vóór de
  // wijziging mist zijn ingesloten foto's; zonder deze stap leest het model
  // opnieuw precies dezelfde stukken en verandert er niets.
  const { haalBijlagenOpnieuwOp } = await import('./ophalen')
  await haalBijlagenOpnieuwOp(berichtId)

  const res = await verwerkBericht(berichtId)
  revalidatePath('/mailintake')
  return res.fout ? { ok: false, error: res.fout } : { ok: true }
}

/**
 * Stelt de scope-samenvatting opnieuw op uit de mail en de bijlagen.
 *
 * Overschrijft wat er stond — dit is een bewuste klik, geen automatiek. Wat de
 * behandelaar zelf had bijgeschaafd raakt daarmee kwijt; daarom vraagt het scherm
 * eerst om bevestiging als er al tekst stond.
 */
export async function hervatSamenvatting(
  berichtId: string,
): Promise<{
  ok: boolean
  tekst?: string | null
  buitenScope?: string | null
  aandachtspunten?: string | null
  error?: string
}> {
  await vereisRecht('mailintake', 'schrijven')
  const res = await maakWerkzaamhedenSamenvatting(berichtId)
  revalidatePath(`/mailintake/${berichtId}`)
  return res.ok
    ? { ok: true, tekst: res.tekst, buitenScope: res.buitenScope, aandachtspunten: res.aandachtspunten }
    : { ok: false, error: res.fout ?? 'Samenvatten mislukt.' }
}

/**
 * Slaat een door een mens bijgeschaafd deel van de omschrijving op bij het bericht.
 *
 * Drie delen, elk met een eigen kolom: Scope, Buiten scope en Aandachtspunten. Ze
 * worden apart bewaard omdat ze in Bouw7 ook apart onder een kopje komen, en omdat
 * een uitsluiting tussen de werkzaamheden als werk leest.
 */
export async function bewaarSamenvatting(
  berichtId: string,
  tekst: string,
  deel: 'scope' | 'buiten_scope' | 'aandachtspunten' = 'scope',
): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  // Uitgeschreven in plaats van met een berekende sleutel: zo controleert
  // TypeScript nog steeds of de kolom werkelijk bestaat.
  const waarde = tekst.trim() || null
  const patch =
    deel === 'buiten_scope' ? { buiten_scope: waarde }
      : deel === 'aandachtspunten' ? { aandachtspunten: waarde }
        : { gevraagde_werkzaamheden: waarde }

  const { error } = await supabase.from('mailintake_berichten').update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)
  if (error) return { ok: false, error: error.message }

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'samenvatting_aangepast', details: { deel, lengte: tekst.trim().length },
  })
  return { ok: true }
}

// ─── Beheer ───────────────────────────────────────────────────────────────────


export async function updatePostbus(id: string, wijziging: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()

  // Alleen velden die hier thuishoren, en alleen als het type klopt. Een losse
  // doorgifte van het binnengekomen object zou elke kolom beschrijfbaar maken en
  // een verkeerd type stil wegschrijven.
  const schoon: PostbusPatch = {}
  const w = wijziging
  if (typeof w.naam === 'string') schoon.naam = w.naam.trim()
  if (typeof w.adres === 'string') schoon.adres = w.adres.trim()
  if (w.soort === 'offerteaanvraag' || w.soort === 'opdracht' || w.soort === 'servicedesk') schoon.soort = w.soort
  if (typeof w.map_id === 'string') schoon.map_id = w.map_id
  if (typeof w.actief === 'boolean') schoon.actief = w.actief
  if (typeof w.automatisch_aanmaken === 'boolean') schoon.automatisch_aanmaken = w.automatisch_aanmaken
  if (typeof w.standaard_werkmaatschappij_id === 'string' || w.standaard_werkmaatschappij_id === null)
    schoon.standaard_werkmaatschappij_id = w.standaard_werkmaatschappij_id
  if (typeof w.standaard_bouw7_categorie_id === 'number' || w.standaard_bouw7_categorie_id === null)
    schoon.standaard_bouw7_categorie_id = w.standaard_bouw7_categorie_id
  if (typeof w.standaard_categorie === 'string' || w.standaard_categorie === null)
    schoon.standaard_categorie = w.standaard_categorie
  if (typeof w.standaard_behandelaar_id === 'string' || w.standaard_behandelaar_id === null)
    schoon.standaard_behandelaar_id = w.standaard_behandelaar_id
  if (Array.isArray(w.notificatie_medewerkers) && w.notificatie_medewerkers.every(x => typeof x === 'string'))
    schoon.notificatie_medewerkers = w.notificatie_medewerkers as string[]
  if (typeof w.dagbudget_cent === 'number' && Number.isFinite(w.dagbudget_cent) && w.dagbudget_cent >= 0)
    schoon.dagbudget_cent = Math.round(w.dagbudget_cent)
  if (typeof w.map_verwerkt_naam === 'string') schoon.map_verwerkt_naam = w.map_verwerkt_naam.trim()
  if (!Object.keys(schoon).length) return { ok: true }

  // Bij een nieuwe mapnaam is de gecachete folder-id waardeloos.
  if (schoon.map_verwerkt_naam !== undefined) schoon.map_verwerkt_id = null
  schoon.updated_at = new Date().toISOString()

  const { error } = await supabase.from('mailintake_postbussen').update(schoon).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

/** De bedrijfsbrede noodrem op de Outlook-nabehandeling. */
export async function zetNabehandelStand(stand: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  if (!['aan', 'alleen_categorie', 'uit'].includes(stand)) return { ok: false, error: 'Onbekende stand.' }

  const supabase = createAdminClient()
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  // `overige` is jsonb en kan volgens het type ook een getal of een lijst zijn;
  // spreaden van zoiets is een typefout die stil een leeg object oplevert.
  const huidig = data?.overige && typeof data.overige === 'object' && !Array.isArray(data.overige)
    ? data.overige
    : {}
  const overige = { ...huidig, mailintake_nabehandeling: stand }
  const { error } = await supabase.from('bedrijfsinstellingen').update({ overige }).eq('id', 1)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

export async function getNabehandelStand(): Promise<string> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.mailintake_nabehandeling
  return v === 'aan' || v === 'uit' ? v : 'alleen_categorie'
}

/** Leest één bericht uit de postbus om de verbinding te toetsen. Schrijft niets. */
export async function controleerVerbinding(postbusId: string): Promise<{
  ok: boolean
  onderwerp?: string | null
  ontvangenOp?: string | null
  /** 'intake' = de aparte registratie; 'hoofd' = stil teruggevallen op de EVA-app. */
  registratie?: 'intake' | 'hoofd' | 'geen'
  error?: string
}> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()
  const { data: p } = await supabase.from('mailintake_postbussen').select('adres').eq('id', postbusId).maybeSingle()
  if (!p) return { ok: false, error: 'Postbus niet gevonden.' }

  const res = await toetsPostbus(p.adres)
  return res.ok
    ? { ok: true, onderwerp: res.onderwerp, ontvangenOp: res.ontvangenOp, registratie: res.registratie }
    : { ok: false, error: res.fout, registratie: res.registratie }
}

/** Handmatig ophalen ("Nu ophalen" in het postvak). */
export async function haalNuOp(): Promise<{ ok: boolean; nieuw: number; fouten: string[] }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()
  const { data } = await supabase.from('mailintake_postbussen').select('*').eq('actief', true).limit(20)

  let nieuw = 0
  const fouten: string[] = []
  for (const p of data ?? []) {
    const res = await haalPostbusOp(p)
    nieuw += res.nieuw
    if (res.fout) fouten.push(`${res.postbus}: ${res.fout}`)
  }

  revalidatePath('/mailintake')
  return { ok: fouten.length === 0, nieuw, fouten }
}

// ─── Aliassen ─────────────────────────────────────────────────────────────────


export async function verwijderAlias(id: string): Promise<{ ok: boolean }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()
  await supabase.from('mailintake_aliassen').delete().eq('id', id)
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

export async function voegNegeerAdresToe(patroon: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  const p = (patroon ?? '').trim().toLowerCase()
  if (!p.includes('@')) return { ok: false, error: 'Geef een e-mailadres of @domein.nl op.' }

  const medewerker = await getCurrentMedewerker()
  const supabase = createAdminClient()
  const { error } = await supabase.from('mailintake_aliassen').upsert({
    patroon: p, soort: 'negeer', aangemaakt_door: medewerker?.id ?? null,
  }, { onConflict: 'patroon' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}
