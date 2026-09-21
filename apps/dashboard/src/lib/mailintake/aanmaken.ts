/**
 * mailintake/aanmaken.ts
 *
 * Van een beoordeeld bericht naar een echt dossier. Gedeeld door de automatische
 * route (cron) en de handmatige route (behandelscherm), zodat er maar één plek is
 * waar de koppeling, de bijlagen en het besluitenlog worden bijgewerkt.
 *
 * Waarom hier geen `vereisRecht` staat: dit is een bibliotheekmodule, geen
 * server action. De rechtencontrole hoort bij de ingang — `actions.ts` doet hem
 * voor de knop, de cron heeft geen gebruiker. Wie deze functie ergens anders
 * aanroept, moet die controle zelf al hebben gedaan.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { Json } from '@everts/database'

import { maakNotificatie } from '@/lib/notificaties/maak'
import { uploadBuffersNaarDossierMap } from '@/lib/o365/dossier-map'

import type { GekeurdeVelden } from './extractie'
import { maakIntakeActie } from './taken'
import { beoordeelBijlage } from './bijlagen-filter'
import { bouwOmschrijvingHtml, bouwTitel } from './omschrijving'

// Blijft vanaf hier herexporteerd: bestaande aanroepers halen hem van deze plek.
export { bouwTitel }
import { leesTerugNaAanmaken, type ControleResultaat } from './controle'
import type { ProefResultaat } from './proef'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'

export interface AanmaakInvoer {
  berichtId: string
  relatieId: string
  contactpersoonId: string | null
  velden: GekeurdeVelden
  /** Het vastgoedobject bij dit werkadres; alleen gevuld bij een eenduidige treffer. */
  objectId?: string | null
  /** De (eventueel bijgeschaafde) scope-samenvatting uit het behandelscherm. */
  gevraagdeWerkzaamheden?: string | null
  /**
   * De drie delen van de projectomschrijving, zoals ze op het scherm staan. Gaan
   * samen als HTML naar Bouw7; wat de behandelaar heeft bijgeschaafd is leidend.
   */
  omschrijving?: { scope: string | null; buitenScope: string | null; aandachtspunten: string | null }
  /**
   * Het voorstel zoals het in de proef stond. Zonder dit wordt er niet teruggelezen
   * -- dan is er namelijk niets om tegen te vergelijken.
   */
  proef?: ProefResultaat
  /**
   * De calculator, als die bij de intake al bekend is. Wordt als dossierrol gezet
   * en gaat mee naar Bouw7; nooit afgeleid uit wie de intake uitvoert.
   */
  calculatorId?: string | null
  /**
   * Een actie die meteen op het nieuwe dossier moet staan. Vaak weet de behandelaar
   * bij het inlezen al wat de eerste stap is -- opname inplannen, bewoners
   * informeren, bestek opvragen -- en dan is dit de goedkoopste plek om dat vast te
   * leggen. Zonder titel gebeurt er niets.
   */
  actie?: { titel: string; medewerkerId: string | null; dagen: number } | null
  /** true = door de cron, zonder mens. Bepaalt de melding en de controletaak. */
  automatisch: boolean
  /** De medewerker die op de knop drukte; null bij de cron. */
  medewerkerId: string | null
  /** De standaard behandelaar van de postbus; krijgt de controletaak. */
  behandelaarId?: string | null
}

export type AanmaakResultaat =
  | {
      ok: true
      dossierId: string
      dossiernummer: string | null
      bouw7Ok: boolean
      bouw7Fout?: string
      /** Verschillen tussen het voorstel en wat er daadwerkelijk staat. */
      afwijkingen?: { veld: string; verstuurd: string | null; teruggelezen: string | null }[]
      /** false = er is een verschil gevonden, dus de bestanden staan nog klaar. */
      bestandenGeplaatst?: boolean
    }
  | { ok: false; error: string }

/**
 * Zet de bijlagen van een bericht in de SharePoint-dossiermap.
 *
 * Loopt via `uploadBuffersNaarDossierMap` uit lib/o365/dossier-map: dat is
 * app-only Graph en vraagt dus géén ingelogde medewerker. Daardoor werkt dit
 * zowel vanuit het behandelscherm als vanuit de cron — anders dan
 * `uploadDossierBestandenNaarSharePoint`, dat een sessie eist.
 *
 * Twee dingen die bewust zo zijn:
 *
 * - **De ontvangstdatum komt voor de bestandsnaam.** Een upload naar SharePoint
 *   is een PUT: een tweede "opdrachtbon.pdf" zou de eerste zonder waarschuwing
 *   overschrijven. Met "2026-09-09 opdrachtbon.pdf" blijven ze naast elkaar
 *   staan en zie je meteen bij welke mail iets hoort.
 * - **In stukken van ~20 MB.** Alle bijlagen tegelijk in het geheugen laden gaat
 *   bij een paar grote PDF's mis op Vercel.
 *
 * Gooit nooit. Wat niet lukt houdt `naar_sharepoint_op` leeg en wordt door de
 * bewakingscron opnieuw geprobeerd — het dossier bestaat dan al, en dat mag hier
 * niet op sneuvelen.
 */
export async function zetBijlagenInSharePoint(
  berichtId: string,
  dossierId: string,
): Promise<{ geuploaded: number; mislukt: number; fout: string | null }> {
  const supabase = createAdminClient()

  const { data: bericht } = await supabase
    .from('mailintake_berichten').select('ontvangen_op').eq('id', berichtId).maybeSingle()
  const datum = (bericht?.ontvangen_op ?? new Date().toISOString()).slice(0, 10)

  const { data: rijen } = await supabase
    .from('mailintake_bijlagen')
    .select('id, bestandsnaam, content_type, opslag_pad, grootte_bytes, is_inline')
    .eq('bericht_id', berichtId)
    .not('opslag_pad', 'is', null)
    .is('naar_sharepoint_op', null)
    .limit(50)

  // Dezelfde zeef als de voorvertoning. Zonder dit belooft het scherm dat
  // image001.jpg buiten de dossiermap blijft terwijl de upload hem er wel in zet
  // -- en dan klopt het voorstel niet met wat er gebeurt.
  const bestanden = (rijen ?? []).filter(r => beoordeelBijlage({
    bestandsnaam: r.bestandsnaam, contentType: r.content_type,
    grootteBytes: r.grootte_bytes, isInline: Boolean(r.is_inline),
  }).mee)

  if (!bestanden.length) return { geuploaded: 0, mislukt: 0, fout: null }

  const RUIMTE = 20 * 1024 * 1024
  let geuploaded = 0
  let mislukt = 0
  const fouten: string[] = []

  let stapel: { rij: any; naam: string; contentType: string; bytes: Uint8Array }[] = []
  let stapelBytes = 0

  const legStapelWeg = async () => {
    if (!stapel.length) return
    const res = await uploadBuffersNaarDossierMap(
      dossierId,
      stapel.map(b => ({ naam: b.naam, contentType: b.contentType, bytes: b.bytes })),
    )
    // `bestanden` bevat alleen de geslaagde uploads; wat er niet in staat is mislukt
    // en blijft dus openstaan voor de bewakingscron.
    const perNaam = new Map((res.bestanden ?? []).map(x => [x.naam, x]))
    for (const b of stapel) {
      const geplaatst = perNaam.get(b.naam)
      if (geplaatst) {
        await supabase.from('mailintake_bijlagen').update({
          naar_sharepoint_op: new Date().toISOString(),
          sharepoint_item_id: geplaatst.itemId,
        }).eq('id', b.rij.id)
        geuploaded++
      } else {
        mislukt++
      }
    }
    if (res.fout) fouten.push(res.fout)
    stapel = []
    stapelBytes = 0
  }

  for (const r of bestanden) {
    // De query filtert hier al op, maar het pad is in het schema nullable; zonder
    // deze controle zou een lege waarde stil als "undefined" naar Storage gaan.
    if (!r.opslag_pad) { mislukt++; continue }
    try {
      const { data: blob, error } = await supabase.storage.from('mail-intake').download(r.opslag_pad)
      if (error || !blob) { mislukt++; continue }
      const bytes = new Uint8Array(await blob.arrayBuffer())

      if (stapelBytes + bytes.length > RUIMTE) await legStapelWeg()

      stapel.push({
        rij: r,
        naam: `${datum} ${r.bestandsnaam}`,
        contentType: r.content_type ?? 'application/octet-stream',
        bytes,
      })
      stapelBytes += bytes.length
    } catch (e) {
      mislukt++
      fouten.push(`${r.bestandsnaam}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await legStapelWeg()

  if (geuploaded || mislukt) {
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'systeem', actie: 'bijlagen_naar_sharepoint',
      details: { dossier_id: dossierId, geuploaded, mislukt, fouten: fouten.slice(0, 5) },
    })
  }

  return { geuploaded, mislukt, fout: fouten.length ? fouten.join('; ').slice(0, 500) : null }
}

/**
 * Maakt het dossier aan en koppelt alles terug aan het bericht.
 *
 * De Bouw7-push zit in `maakAanvraag` en is synchroon. Faalt die, dan bestaat het
 * EVA-dossier wél — dat is bestaand gedrag en bewust: liever een dossier zonder
 * Bouw7-nummer dan een verloren aanvraag. Het komt terug in `bouw7Ok`.
 */
export async function maakDossierUitBericht(inv: AanmaakInvoer): Promise<AanmaakResultaat> {
  const supabase = createAdminClient()
  const v = inv.velden

  // Eerst de contactpersoon in Bouw7 zetten, dan pas het project. Andersom wordt
  // het project zonder contactpersoon aangemaakt en is dat achteraf niet meer te
  // repareren zonder handwerk. Lukt het aanmaken niet, dan gaat het project
  // gewoon door -- een project zonder contactpersoon is bruikbaar, een verloren
  // aanvraag niet -- maar staat de reden in het besluitenlog.
  if (inv.contactpersoonId) {
    const { zorgVoorBouw7Contactpersoon } = await import('./contactpersoon-bouw7')
    const cpRes = await zorgVoorBouw7Contactpersoon(inv.contactpersoonId, inv.relatieId)
      .catch((e: unknown) => ({ ok: false as const, reden: e instanceof Error ? e.message : String(e) }))
    if (!cpRes.ok || cpRes.aangemaakt) {
      await supabase.from('mailintake_besluiten').insert({
        bericht_id: inv.berichtId,
        actor: 'systeem',
        actie: cpRes.ok ? 'contactpersoon_in_bouw7_aangemaakt' : 'contactpersoon_niet_in_bouw7',
        details: cpRes.ok
          ? { contactpersoon_id: inv.contactpersoonId, bouw7_id: cpRes.bouw7Id }
          : { contactpersoon_id: inv.contactpersoonId, reden: cpRes.reden },
      })
    }
  }

  const { maakAanvraag } = await import('@/lib/dossiers/actions')
  const res = await maakAanvraag({
    titel: bouwTitel(v),
    klant_id: inv.relatieId,
    contactpersoon_id: inv.contactpersoonId,
    categorie: v.categorieNaam,
    bouw7_categorie_id: v.bouw7CategorieId,
    referentie: v.referentie,
    werkmaatschappij_id: v.werkmaatschappijId,
    vve_code: v.vveCode,
    aanvraagdatum: v.aanvraagdatum,
    deadline: v.deadline,
    // Gaat naar Bouw7 als `information` en staat daar onder Omschrijving. Altijd
    // in drie delen -- Scope, Buiten scope, Aandachtspunten -- en als eigen HTML,
    // want Bouw7 rendert HTML maar zet Markdown niet om en negeert losse enters.
    opmerkingen: bouwOmschrijvingHtml({
      scope: inv.omschrijving?.scope ?? null,
      buitenScope: inv.omschrijving?.buitenScope ?? null,
      aandachtspunten: [inv.omschrijving?.aandachtspunten, v.opmerkingen]
        .filter(Boolean).join('\n') || null,
    }) || v.opmerkingen,
    werkadres_straat: v.werkadresStraat,
    werkadres_huisnummer: v.werkadresHuisnummer,
    werkadres_postcode: v.werkadresPostcode,
    werkadres_stad: v.werkadresStad,
    // Koppelt het dossier meteen onder het juiste complex/pand, zoals de
    // aanvraagmodal dat doet via de objectkiezer.
    object_id: inv.objectId ?? null,
  })

  if (!res.ok) return { ok: false, error: res.error }

  const dossierId = res.data.id

  // De scope-samenvatting hoort bij het dossier, niet bij het bericht: dit is wat
  // een calculator als eerste leest. Valt terug op wat er bij de intake is
  // opgesteld als de behandelaar hem niet heeft aangepast.
  await zetWerkzaamhedenOpDossier(dossierId, inv.berichtId, inv.gevraagdeWerkzaamheden ?? null).catch(() => {})

  // De calculator, als de behandelaar hem bij de intake al heeft aangewezen. Dat
  // kon eerder niet: rollen werden pas later aan een dossier gehangen, en het
  // formulier had er dus geen veld voor. Wie het bij binnenkomst al weet, hoeft er
  // nu niet nog een keer voor terug te komen.
  //
  // Nooit afleiden uit wie de intake doet -- dat is een andere rol, en een
  // verkeerde calculator op een dossier leidt de hele planning om.
  if (inv.calculatorId) {
    const { updateDossierRollen } = await import('@/lib/dossiers/actions')
    await updateDossierRollen(dossierId, { calculator_id: inv.calculatorId }, { schrijfBouw7: true })
      .catch(() => undefined)
  }

  // De eerste actie op het dossier, als de behandelaar die al wist. Loopt via
  // dezelfde helper als de controletaak: die is ongegate (de cron heeft geen
  // sessie) en hangt de taak aan het bericht én aan het dossier. Valt terug op de
  // calculator als er geen eigenaar is gekozen -- die is dan toch degene die ermee
  // verder moet.
  if (inv.actie?.titel?.trim()) {
    await maakIntakeActie({
      berichtId: inv.berichtId,
      dossierId,
      titel: inv.actie.titel.trim().slice(0, 200),
      medewerkerId: inv.actie.medewerkerId ?? inv.calculatorId ?? null,
      dagen: inv.actie.dagen,
      toelichting: 'Vastgelegd bij het inlezen van de binnengekomen mail.',
    })
  }

  // Mandaat en facturatiemethode kunnen niet mee in maakAanvraag -- die velden kent
  // de aanvraagmodal niet. Zonder deze stap zou het bedrag uit de bon wel gelezen
  // zijn en nergens terechtkomen.
  if (v.mandaatBedrag != null || v.regie) {
    const { updateServicedeskInstellingen } = await import('@/lib/dossiers/servicedesk')
    await updateServicedeskInstellingen(dossierId, {
      ...(v.mandaatBedrag != null ? { mandaat_bedrag: v.mandaatBedrag } : {}),
      // Regie betekent: afrekenen op nacalculatie, dus geen aanneemsom vooraf.
      ...(v.regie ? { facturatiemethode: 'regie' as const } : {}),
    }).catch(() => undefined)
  }

  // Een afwijkend factuuradres uit de opdracht vastleggen bij de opdrachtgever, en
  // aan het dossier hangen. De opdrachtgever zelf verandert niet -- dit gaat alleen
  // over waar de factuur heen gaat.
  if (v.factuuradres?.straat) {
    await zetFactuuradres(dossierId, inv.relatieId, v.factuuradres).catch(() => undefined)
  }

  // Herkomst vastleggen. Dit is wat de nacontroles later leesbaar maakt:
  // "welke dossiers komen uit mail, en hoeveel daarvan zijn achteraf vervallen?"
  await supabase.from('dossiers').update({ mailintake_bericht_id: inv.berichtId }).eq('id', dossierId)

  await supabase.from('mailintake_berichten').update({
    status: 'verwerkt',
    besluit: inv.automatisch ? 'automatisch_aangemaakt' : 'handmatig_aangemaakt',
    dossier_id: dossierId,
    relatie_id: inv.relatieId,
    contactpersoon_id: inv.contactpersoonId,
    behandeld_door: inv.medewerkerId,
    behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', inv.berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: inv.berichtId,
    actor: inv.automatisch ? 'systeem' : 'medewerker',
    medewerker_id: inv.medewerkerId,
    actie: 'dossier_aangemaakt',
    details: {
      dossier_id: dossierId,
      dossiernummer: res.data.dossiernummer,
      bouw7_ok: res.bouw7.ok,
      bouw7_fout: res.bouw7.error ?? null,
      automatisch: inv.automatisch,
    },
  })

  // ── Teruglezen ─────────────────────────────────────────────────────────────
  // "Gelukt" van een schrijfactie betekent alleen dat er geen fout terugkwam, niet
  // dat het veld gevuld is. Daarom hier een vergelijking tussen wat er verstuurd is
  // en wat er werkelijk staat.
  //
  // Bij een verschil gaan de bestanden er níét in. Dat is de regel uit de
  // intakebeschrijving en het is de goede kant om op te falen: een half dossier is
  // te repareren, een dossiermap vol stukken onder het verkeerde project veel
  // minder. De controle zelf mag nooit een bestaand dossier omverhalen, vandaar de
  // catch eromheen -- maar dan geldt het als "niet gecontroleerd" en blijven de
  // bestanden alsnog staan.
  let controle: ControleResultaat | null = null
  if (inv.proef) {
    controle = await leesTerugNaAanmaken(dossierId, inv.proef).catch(() => null)
    if (controle && !controle.klopt) {
      await supabase.from('mailintake_besluiten').insert({
        bericht_id: inv.berichtId, actor: 'systeem', actie: 'teruglezing_wijkt_af',
        details: { dossier_id: dossierId, afwijkingen: controle.afwijkingen } as unknown as Json,
      })
    }
  }

  const mochtUploaden = controle == null ? true : controle.klopt

  // De bijlagen horen bij het dossier, niet bij de mailbox. Best-effort: mislukt
  // dit, dan blijft het dossier gewoon staan en probeert de bewakingscron opnieuw.
  if (mochtUploaden) {
    await zetBijlagenInSharePoint(inv.berichtId, dossierId).catch(() => {})
  }

  // Bij een automatisch dossier hoort altijd een mens die er nog naar kijkt.
  if (inv.automatisch) {
    await zetControletaak(dossierId, res.data.dossiernummer ?? null, inv.berichtId, inv.behandelaarId ?? null)
    await meldAutomatischAangemaakt(dossierId, inv.berichtId, res.data.dossiernummer ?? null).catch(() => {})
  }

  // De mail mag nu uit het zicht (§ nabehandeling).
  await planNabehandeling(inv.berichtId)
  await voerNabehandelingUit(inv.berichtId).catch(() => {})

  return {
    ok: true,
    dossierId,
    dossiernummer: res.data.dossiernummer ?? null,
    bouw7Ok: res.bouw7.ok,
    bouw7Fout: res.bouw7.error,
    afwijkingen: controle?.afwijkingen ?? [],
    bestandenGeplaatst: mochtUploaden,
  }
}

/** Koppelt het bericht aan een bestaand dossier zonder iets nieuws te maken. */
export async function koppelAanDossier(
  berichtId: string,
  dossierId: string,
  medewerkerId: string | null,
  besluit: 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen' = 'gekoppeld_bestaand',
): Promise<void> {
  const supabase = createAdminClient()

  // De klant van het dossier overnemen als het bericht er nog geen had. Zonder dit
  // toonde een afgehandeld bericht achteraf geen opdrachtgever, terwijl die bij het
  // gekozen dossier gewoon bekend is.
  const { data: dossier } = await supabase
    .from('dossiers').select('klant_id, contactpersoon_id').eq('id', dossierId).maybeSingle()
  const { data: huidig } = await supabase
    .from('mailintake_berichten').select('relatie_id, contactpersoon_id').eq('id', berichtId).maybeSingle()

  await supabase.from('mailintake_berichten').update({
    status: 'verwerkt',
    besluit,
    dossier_id: dossierId,
    relatie_id: huidig?.relatie_id ?? dossier?.klant_id ?? null,
    contactpersoon_id: huidig?.contactpersoon_id ?? dossier?.contactpersoon_id ?? null,
    behandeld_door: medewerkerId,
    behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_duplicaat_kandidaten')
    .update({ gekozen: true }).eq('bericht_id', berichtId).eq('dossier_id', dossierId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: medewerkerId ? 'medewerker' : 'systeem',
    medewerker_id: medewerkerId, actie: 'gekoppeld', details: { dossier_id: dossierId, besluit },
  })

  // Ook bij koppelen: de opdrachtbon hoort in het dossier terecht te komen, niet
  // alleen in de mailbox. Dat is juist bij deze route de reden dat iemand koppelt.
  await zetBijlagenInSharePoint(berichtId, dossierId).catch(() => {})

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
}

/**
 * Legt vast dat dit adres bij deze relatie hoort. Dit is het leergeheugen: elke
 * handmatige keuze in fase 1 maakt de herkenning in fase 2 een stuk sterker.
 */
export async function onthoudAlias(opts: {
  adres: string | null
  relatieId: string
  contactpersoonId: string | null
  medewerkerId: string | null
}): Promise<void> {
  const adres = (opts.adres ?? '').trim().toLowerCase()
  if (!adres.includes('@')) return

  const supabase = createAdminClient()
  await supabase.from('mailintake_aliassen').upsert({
    patroon: adres,
    soort: 'koppel',
    relatie_id: opts.relatieId,
    contactpersoon_id: opts.contactpersoonId,
    aangemaakt_door: opts.medewerkerId,
    laatst_gebruikt_op: new Date().toISOString(),
  }, { onConflict: 'patroon', ignoreDuplicates: false })
}

// ─── Meldingen bij een automatisch dossier ───────────────────────────────────

/**
 * Legt een factuuradres vast bij de opdrachtgever en koppelt het aan het dossier.
 *
 * Bestaat er al een adres met dezelfde straat, dan wordt dat hergebruikt; anders zou
 * elke bon van dezelfde VvE een nieuw adres opleveren.
 */
async function zetFactuuradres(
  dossierId: string,
  relatieId: string,
  adres: { naam: string | null; straat: string | null; postcode: string | null; plaats: string | null },
): Promise<void> {
  const supabase = createAdminClient()
  const straat = (adres.straat ?? '').trim()
  if (!straat) return

  const label = (adres.naam ?? '').trim() || 'Factuuradres uit de opdracht'

  const { data: bestaand } = await supabase
    .from('relatie_factuuradressen')
    .select('id')
    .eq('relatie_id', relatieId)
    .ilike('straat', straat)
    .limit(1)
    .maybeSingle()

  let id = bestaand?.id ?? null
  if (!id) {
    const { data } = await supabase
      .from('relatie_factuuradressen')
      .insert({
        relatie_id: relatieId,
        label: label.slice(0, 120),
        straat,
        postcode: (adres.postcode ?? '').trim() || null,
        plaats: (adres.plaats ?? '').trim() || null,
      })
      .select('id')
      .single()
    id = data?.id ?? null
  }

  if (id) await supabase.from('dossiers').update({ factuuradres_id: id }).eq('id', dossierId)
}

async function zetControletaak(
  dossierId: string,
  dossiernummer: string | null,
  berichtId: string,
  behandelaarId: string | null,
): Promise<void> {
  // Ging eerder naar de calculator van het dossier. Dat werkte niet: die rol wordt
  // pas later gevuld, dus bij een vers dossier hing de taak aan niemand. En hij
  // liep via de gated `maakTaak`, die in de cron altijd "Niet ingelogd" gooide --
  // de taak werd dus sowieso nooit aangemaakt.
  await maakIntakeActie({
    berichtId,
    dossierId,
    medewerkerId: behandelaarId,
    titel: `Controleer automatisch aangemaakt dossier${dossiernummer ? ` ${dossiernummer}` : ''}`,
    toelichting: [
      'EVA heeft dit dossier zelf aangemaakt uit een binnengekomen e-mail, zonder dat er',
      'iemand naar gekeken heeft. Loop na:',
      '',
      '- Is dit de juiste opdrachtgever en contactpersoon?',
      '- Klopt het werkadres, en hangt het dossier onder het juiste object?',
      '- Dekt de omschrijving wat er echt gevraagd wordt?',
      '- Klopt de categorie? Die bepaalt op welk bord het dossier verschijnt.',
      '- Klopt de deadline? Als de mail er geen noemde, staat hij op vier weken.',
      '- Staan de bijlagen in de dossiermap?',
      '',
      `De oorspronkelijke mail: /mailintake/${berichtId}`,
    ].join('\n'),
    dagen: 1,
  })
}

/** Meldt het aan de rolhouders van het verse dossier. Nooit stil aanmaken. */
async function meldAutomatischAangemaakt(
  dossierId: string,
  berichtId: string,
  dossiernummer: string | null,
): Promise<void> {
  const supabase = createAdminClient()
  const { data: d } = await supabase
    .from('dossiers')
    .select('titel, calculator_id, werkvoorbereider_id, project_manager_id, klant:relaties!dossiers_klant_id_fkey(naam)')
    .eq('id', dossierId)
    .maybeSingle()
  if (!d) return

  const rolIds = [d.calculator_id, d.werkvoorbereider_id, d.project_manager_id]
    .filter((x): x is string => Boolean(x))
  if (!rolIds.length) return

  const { data: mw } = await supabase
    .from('medewerkers').select('auth_user_id').in('id', rolIds)
    .eq('actief', true).not('auth_user_id', 'is', null).limit(10)

  for (const m of mw ?? []) {
    // `.not('auth_user_id','is',null)` staat in de query, maar het schema kent het
    // veld als nullable -- en een notificatie zonder gebruiker landt nergens.
    if (!m.auth_user_id) continue
    await maakNotificatie({
      user_id: m.auth_user_id,
      type: 'mailintake_automatisch_aangemaakt',
      titel: `Dossier ${dossiernummer ?? ''} automatisch aangemaakt uit e-mail`.replace('  ', ' '),
      body: `${d.klant?.naam ?? 'Onbekende klant'} — ${d.titel}. Controleer of dit klopt.`,
      url: `/mailintake/${berichtId}`,
      dossier_id: dossierId,
      dossier_naam: d.titel,
    })
  }
}

/**
 * Zet de scope-samenvatting op het dossier, met een leesbare herkomstregel.
 *
 * `tekst` is wat er in het behandelscherm stond op het moment van aanmaken —
 * inclusief eventuele aanscherpingen van de behandelaar. Is die leeg, dan valt
 * hij terug op wat EVA bij de intake opstelde.
 */
async function zetWerkzaamhedenOpDossier(
  dossierId: string,
  berichtId: string,
  tekst: string | null,
): Promise<void> {
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('gevraagde_werkzaamheden, gevraagde_werkzaamheden_bronnen, gevraagde_werkzaamheden_gemist')
    .eq('id', berichtId)
    .maybeSingle()

  const definitief = (tekst ?? '').trim() || (b?.gevraagde_werkzaamheden ?? '').trim()
  if (!definitief) return

  const { herkomstregel } = await import('./werkzaamheden')
  const bronnen: string[] = b?.gevraagde_werkzaamheden_bronnen ?? []
  const gemist: string[] = b?.gevraagde_werkzaamheden_gemist ?? []
  const herkomst = herkomstregel(bronnen, 'mail') +
    (gemist.length ? ` Niet meegelezen: ${gemist.join(', ')}.` : '')

  await supabase.from('dossiers').update({
    gevraagde_werkzaamheden: definitief,
    gevraagde_werkzaamheden_bron: herkomst,
    gevraagde_werkzaamheden_op: new Date().toISOString(),
  }).eq('id', dossierId)
}
