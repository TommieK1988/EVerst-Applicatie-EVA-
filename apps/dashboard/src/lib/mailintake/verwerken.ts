/**
 * mailintake/verwerken.ts
 *
 * Stap 2 van de pijplijn: van opgehaald bericht naar een besluit.
 *
 * Volgorde: claimen → bijlagen ophalen → AI → afzender herkennen → keuren →
 * duplicaten zoeken → beslissen → uitvoeren. De dure stap (AI) staat bewust ná
 * de claim en vóór alle database-werk, zodat een vastgelopen run niets half
 * afmaakt en een retry niets dubbel doet.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { Json } from '@everts/database'

import { cronLogboek } from '@/lib/cron/logboek'
import { maakNotificatie } from '@/lib/notificaties/maak'

import { extraheer, keurEnKalibreer, kernVertrouwen, type BijlageVoorAI, type WitteLijsten } from './extractie'
import { herkenAfzender, hulplijstRelaties } from './afzender'
import { zoekDuplicaten } from './duplicaten'
import { beslis, samenvattendeReden } from './beslis'
import { zetOfferteGewonnenUitBericht } from './opdracht'
import { maakIntakeActie } from './taken'
import { zoekObjectBijAdres } from './objecten'
import { controleerBouw7Gereed } from './bouw7-gereed'
import { maakWerkzaamhedenSamenvatting } from './werkzaamheden-uitvoeren'
import { domeinVan, afzenderUitDoorstuur } from './triage'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'
import { maakDossierUitBericht } from './aanmaken'
import {
  AFZENDER_ONBEKEND, SOORT_ONZEKER, DUPLICAAT_HARD,
  type PostbusRij, type MailSoort,
} from './types'

/** Per run; de AI-stap plus een eventuele Bouw7-push duurt 10-30 s per bericht. */
const BATCH = 5
export const MAX_POGINGEN = 3

/** Een bericht dat langer dan dit op 'bezig' staat, is blijven hangen. */
export const CLAIM_VERVAL_MINUTEN = 30

export interface VerwerkResultaat {
  berichtId: string
  status: string
  automatisch: boolean
  reden: string
  fout: string | null
  kostenCent: number
}

// ─── Hulpjes ──────────────────────────────────────────────────────────────────

/** Domeinen die van onszelf zijn; nodig om doorgestuurde mail te herkennen. */
async function eigenDomeinen(): Promise<Set<string>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('medewerkers').select('email').eq('actief', true).not('email', 'is', null).limit(500)
  const uit = new Set<string>()
  for (const m of data ?? []) {
    const d = domeinVan(m.email)
    if (d) uit.add(d)
  }
  return uit
}

async function witteLijsten(): Promise<WitteLijsten> {
  const supabase = createAdminClient()
  const [cats, wms] = await Promise.all([
    (async () => {
      try {
        const { getBouw7Categorieen } = await import('@/lib/bouw7/create-project')
        return (await getBouw7Categorieen()).map(c => ({ id: c.id, naam: c.name }))
      } catch {
        return []
      }
    })(),
    supabase.from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').limit(50),
  ])
  return {
    categorieen: cats,
    werkmaatschappijen: ((wms as any).data ?? []).map((w: any) => ({ id: w.id, naam: w.naam })),
  }
}

/** Kosten van vandaag voor deze postbus, voor de dagbudget-rem. */
async function kostenVandaag(postbusId: string): Promise<number> {
  const supabase = createAdminClient()
  const begin = new Date(); begin.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('mailintake_extracties')
    .select('kosten_cent, bericht:mailintake_berichten!inner(postbus_id)')
    .eq('bericht.postbus_id', postbusId)
    .gte('created_at', begin.toISOString())
    .limit(1000)
  return (data ?? []).reduce((som: number, r: any) => som + (r.kosten_cent ?? 0), 0)
}

/** Bijlagen uit de bucket halen om aan het model te geven. */
async function bijlagenVoorAI(berichtId: string): Promise<{ voorAI: BijlageVoorAI[]; namen: string[]; ongelezen: boolean }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_bijlagen')
    .select('id, bestandsnaam, content_type, opslag_pad, te_groot')
    .eq('bericht_id', berichtId)
    .eq('is_inline', false)
    .limit(50)

  const voorAI: BijlageVoorAI[] = []
  const namen: string[] = []
  let ongelezen = false

  for (const b of data ?? []) {
    namen.push(b.bestandsnaam)
    if (b.te_groot || !b.opslag_pad) { ongelezen = true; continue }
    try {
      const { data: blob, error } = await supabase.storage.from('mail-intake').download(b.opslag_pad)
      if (error || !blob) { ongelezen = true; continue }
      voorAI.push({
        bestandsnaam: b.bestandsnaam,
        contentType: b.content_type,
        bytes: Buffer.from(await blob.arrayBuffer()),
      })
    } catch {
      ongelezen = true
    }
  }

  return { voorAI, namen, ongelezen }
}

/** Wie krijgt bericht over deze postbus? Levert auth-user-ids, niet medewerker-ids. */
async function ontvangers(postbus: PostbusRij): Promise<{ userId: string; medewerkerId: string }[]> {
  if (!postbus.notificatie_medewerkers.length) return []
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('medewerkers')
    .select('id, auth_user_id')
    .in('id', postbus.notificatie_medewerkers)
    .eq('actief', true)
    .not('auth_user_id', 'is', null)
    .limit(50)
  return (data ?? []).map((m: any) => ({ userId: m.auth_user_id, medewerkerId: m.id }))
}

// ─── De verwerking van één bericht ───────────────────────────────────────────

export async function verwerkBericht(berichtId: string): Promise<VerwerkResultaat> {
  const supabase = createAdminClient()
  const log = cronLogboek(`mailintake-verwerken:${berichtId.slice(0, 8)}`)
  const uit: VerwerkResultaat = { berichtId, status: 'mislukt', automatisch: false, reden: '', fout: null, kostenCent: 0 }

  // ── Claimen ────────────────────────────────────────────────────────────────
  // De rowcount is de grendel: pakt een parallelle run hem al, dan is die 0.
  const { data: geclaimd } = await supabase
    .from('mailintake_berichten')
    .update({ status: 'bezig', updated_at: new Date().toISOString() })
    .eq('id', berichtId)
    .in('status', ['nieuw', 'mislukt'])
    .select('*, postbus:mailintake_postbussen(*)')
    .maybeSingle()

  if (!geclaimd) {
    return { ...uit, status: 'overgeslagen', reden: 'Al in behandeling door een andere run.' }
  }

  const postbus = geclaimd.postbus as PostbusRij
  const pogingen = (geclaimd.pogingen ?? 0) + 1

  try {
    // ── Bijlagen ────────────────────────────────────────────────────────────
    log.stap('bijlagen laden')
    const { voorAI, namen, ongelezen } = await bijlagenVoorAI(berichtId)

    // ── Budget ──────────────────────────────────────────────────────────────
    const budgetOp = (await kostenVandaag(postbus.id)) >= postbus.dagbudget_cent

    // ── Doorgestuurde mail? ─────────────────────────────────────────────────
    const eigen = await eigenDomeinen()
    const vanDomein = domeinVan(geclaimd.van_adres)
    const isDoorstuur = vanDomein != null && eigen.has(vanDomein)
    const echteAfzender = isDoorstuur
      ? (afzenderUitDoorstuur(geclaimd.body_tekst ?? '', eigen) ?? geclaimd.van_adres)
      : geclaimd.van_adres

    // ── AI ──────────────────────────────────────────────────────────────────
    log.stap('hulplijst relaties')
    const hulplijst = await hulplijstRelaties(echteAfzender, geclaimd.onderwerp)

    log.stap('AI-extractie', { bijlagen: voorAI.length })
    const ex = await extraheer({
      postbusSoort: postbus.soort,
      postbusAdres: postbus.adres,
      onderwerp: geclaimd.onderwerp,
      vanNaam: geclaimd.van_naam,
      vanAdres: geclaimd.van_adres,
      aan: geclaimd.aan ?? [],
      cc: geclaimd.cc ?? [],
      ontvangenOp: geclaimd.ontvangen_op,
      bodyTekst: geclaimd.body_tekst ?? '',
      bijlagenamen: namen,
      bekendeRelaties: hulplijst,
    }, voorAI)

    uit.kostenCent = ex.kostenCent

    const { data: laatste } = await supabase
      .from('mailintake_extracties').select('versie')
      .eq('bericht_id', berichtId).eq('ronde', 'velden')
      .order('versie', { ascending: false }).limit(1).maybeSingle()
    const volgende = ((laatste?.versie ?? 0) as number) + 1
    await supabase.from('mailintake_extracties').insert({
      bericht_id: berichtId,
      ronde: 'velden',
      versie: volgende,
      model: ex.model,
      prompt_versie: ex.promptVersie,
      soort: ex.data?.soort ?? null,
      velden: ex.data ? (ex.data as unknown as Json) : {},
      vertrouwen: ex.data?.vertrouwen ?? {},
      toelichting: ex.data?.toelichting ?? null,
      invoer_tokens: ex.invoerTokens,
      uitvoer_tokens: ex.uitvoerTokens,
      kosten_cent: ex.kostenCent,
      status: ex.ok ? 'gereed' : 'mislukt',
      fout: ex.fout,
      ruwe_uitvoer: ex.ruweUitvoer,
    })

    if (!ex.ok || !ex.data) {
      // De AI viel om. Niet weggooien: leg het voor, met de fout erbij.
      const eindStatus = pogingen >= MAX_POGINGEN ? 'wacht_op_mens' : 'mislukt'
      await supabase.from('mailintake_berichten').update({
        status: eindStatus, pogingen, laatste_fout: ex.fout,
        samenvatting: 'EVA kon deze mail niet lezen; beoordeel hem zelf.',
      }).eq('id', berichtId)
      log.mislukt(ex.fout ?? 'onbekend')
      return { ...uit, status: eindStatus, fout: ex.fout, reden: 'AI-extractie mislukt.' }
    }

    // ── Afzender ────────────────────────────────────────────────────────────
    log.stap('afzender herkennen')
    const afz = await herkenAfzender({
      vanAdres: echteAfzender,
      klantNaamUitMail: ex.data.klant_naam,
      doorgestuurd: isDoorstuur,
    })

    // ── Keuren ──────────────────────────────────────────────────────────────
    log.stap('velden keuren')
    const lijsten = await witteLijsten()
    const brontekst = `${geclaimd.onderwerp ?? ''}\n${geclaimd.body_tekst ?? ''}`
    const velden = await keurEnKalibreer(ex.data, lijsten, brontekst, postbus.standaard_werkmaatschappij_id, {
      ontvangenOp: geclaimd.ontvangen_op,
      isServicedesk: postbus.soort === 'servicedesk',
      standaardCategorieId: postbus.standaard_bouw7_categorie_id,
    })

    // ── Object bij het werkadres ────────────────────────────────────────────
    // Een aanvraag hoort bij een complex of pand dat we vaak al kennen. Koppelen
    // scheelt niet alleen typwerk: het dossier verschijnt daardoor ook onder het
    // object, en de standaard-opdrachtgever van dat object is een extra controle
    // op de klant die we uit de mail hebben gehaald.
    log.stap('object zoeken')
    const objectTreffer = await zoekObjectBijAdres({
      straat: velden.werkadresStraat,
      huisnummer: velden.werkadresHuisnummer,
      postcode: velden.werkadresPostcode,
      stad: velden.werkadresStad,
      vveCode: velden.vveCode,
      relatieId: afz.relatieId,
    })

    // ── Kan Bouw7 hier een net project van maken? ───────────────────────────
    log.stap('bouw7-gereedheid')
    const bouw7 = await controleerBouw7Gereed({
      titel: velden.omschrijving,
      relatieId: afz.relatieId,
      contactpersoonId: afz.contactpersoonId,
      werkmaatschappijId: velden.werkmaatschappijId,
      bouw7CategorieId: velden.bouw7CategorieId,
    })

    // ── Duplicaten ──────────────────────────────────────────────────────────
    log.stap('duplicaten zoeken')
    const { data: hashes } = await supabase
      .from('mailintake_bijlagen').select('sha256').eq('bericht_id', berichtId).not('sha256', 'is', null).limit(20)

    const kandidaten = await zoekDuplicaten({
      berichtId,
      relatieId: afz.relatieId,
      onderwerp: geclaimd.onderwerp,
      omschrijving: velden.omschrijving,
      postcode: velden.werkadresPostcode,
      huisnummer: velden.werkadresHuisnummer,
      referentie: velden.referentie,
      onzeReferentie: velden.onzeReferentie,
      bedrag: velden.bedragExclBtw,
      bodyTekst: geclaimd.body_tekst,
      conversationId: geclaimd.conversation_id,
      bijlageHashes: (hashes ?? []).map((h: any) => h.sha256),
    })

    if (kandidaten.length) {
      await supabase.from('mailintake_duplicaat_kandidaten').upsert(
        kandidaten.map(k => ({
          bericht_id: berichtId, dossier_id: k.dossierId,
          score: k.score, redenen: k.redenen, soort: k.soort,
        })),
        { onConflict: 'bericht_id,dossier_id' },
      )
    }
    const topscore = kandidaten[0]?.score ?? 0

    // Een offertetreffer is iets anders dan een duplicaat: het is het dossier waar
    // deze opdracht bij hoort. "Hard" betekent dat er niets te kiezen valt -- een
    // score boven de duplicaatdrempel en maar een enkele kandidaat op dat niveau.
    // Bij 194 lopende offertes is de verkeerde aanwijzen duur: dan gaat de verkeerde
    // offerte op gewonnen, promoveert dat dossier en vertrekt er een aanneemsom.
    const offertes = kandidaten.filter(k => k.soort === 'offerte_match')
    const harde = offertes.filter(k => k.score >= DUPLICAAT_HARD)
    const offerteMatchGevonden = offertes.length > 0
    const offerteMatchHard = harde.length === 1

    // ── Beslissen ───────────────────────────────────────────────────────────
    const veldenCompleet = Boolean(
      afz.relatieId && velden.omschrijving && velden.werkmaatschappijId && velden.bouw7CategorieId &&
      velden.werkadresStraat && velden.werkadresHuisnummer && velden.werkadresPostcode && velden.werkadresStad,
    )

    const besluit = beslis({
      automatischToegestaan: postbus.automatisch_aanmaken,
      soort: ex.data.soort as MailSoort,
      soortVertrouwen: ex.data.soort_vertrouwen,
      afzenderScore: afz.score,
      aantalRelatieKandidaten: afz.relatieId ? 1 : afz.kandidaten.length,
      veldenCompleet,
      adresBevestigd: velden.adresBevestigd,
      vertrouwen: velden.vertrouwen,
      duplicaatTopscore: topscore,
      offerteMatchGevonden,
      offerteMatchHard,
      isAntwoord: Boolean(geclaimd.is_antwoord),
      meerdereWerkadressen: velden.meerdereWerkadressen,
      ongelezenBijlage: ongelezen || ex.overgeslagenBijlagen.length > 0,
      dagbudgetOp: budgetOp,
      bouw7Gereed: bouw7.gereed,
      bouw7Ontbreekt: bouw7.ontbreekt,
    })

    uit.reden = samenvattendeReden(besluit)

    await supabase.from('mailintake_berichten').update({
      soort: ex.data.soort,
      soort_vertrouwen: ex.data.soort_vertrouwen,
      samenvatting: ex.data.samenvatting,
      relatie_id: afz.relatieId,
      contactpersoon_id: afz.contactpersoonId,
      herkend_via: afz.via,
      herkenning_score: afz.score,
      duplicaat_topscore: topscore,
      object_id: objectTreffer.objectId,
      object_score: objectTreffer.score || null,
      object_via: objectTreffer.via,
      bouw7_gereed: bouw7.gereed,
      bouw7_ontbreekt: bouw7.ontbreekt,
      pogingen,
      laatste_fout: null,
      status: besluit.automatisch ? 'bezig' : besluit.status,
    }).eq('id', berichtId)

    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'systeem', actie: 'beoordeeld',
      details: {
        soort: ex.data.soort, soort_vertrouwen: ex.data.soort_vertrouwen,
        afzender_score: afz.score, herkend_via: afz.via,
        duplicaat_topscore: topscore, redenen: besluit.redenen,
        object_id: objectTreffer.objectId, object_via: objectTreffer.via,
        bouw7_gereed: bouw7.gereed, bouw7_ontbreekt: bouw7.ontbreekt,
        kosten_cent: ex.kostenCent,
      },
    })

    // ── Scope-samenvatting ──────────────────────────────────────────────────
    // Alleen bij een offerteaanvraag: daar bespaart een scope de meeste tijd, en
    // bij een opdrachtbon of servicedeskbon is hij meestal één regel en de tweede
    // AI-ronde de kosten niet waard. Voor die soorten staat de knop er wel.
    // Faalt de samenvatting, dan gaat het bericht gewoon door — een scope is nooit
    // belangrijk genoeg om een aanvraag op te laten sneuvelen.
    if (ex.data.soort === 'offerteaanvraag') {
      log.stap('werkzaamheden samenvatten')
      const wz = await maakWerkzaamhedenSamenvatting(berichtId).catch(() => null)
      if (wz) uit.kostenCent += wz.kostenCent
    }

    // ── Uitvoeren ───────────────────────────────────────────────────────────
    if (besluit.automatisch && besluit.route === 'nieuw_dossier' && afz.relatieId) {
      log.stap('dossier aanmaken')
      const res = await maakDossierUitBericht({
        berichtId,
        relatieId: afz.relatieId,
        contactpersoonId: afz.contactpersoonId,
        velden,
        objectId: objectTreffer.objectId,
        automatisch: true,
        medewerkerId: null,
        behandelaarId: postbus.standaard_behandelaar_id,
      })
      if (!res.ok) {
        await supabase.from('mailintake_berichten')
          .update({ status: 'wacht_op_mens', laatste_fout: res.error }).eq('id', berichtId)
        await voorleggen(postbus, berichtId, geclaimd, 'Automatisch aanmaken mislukt; beoordeel dit zelf.')
        return { ...uit, status: 'wacht_op_mens', fout: res.error, reden: 'Automatisch aanmaken mislukt; voorgelegd.' }
      }
      uit.status = 'verwerkt'
      uit.automatisch = true
    } else if (besluit.automatisch && besluit.route === 'offerte_winnen') {
      log.stap('offerte op gewonnen zetten')
      const doel = kandidaten.find(k => k.soort === 'offerte_match' && k.score >= DUPLICAAT_HARD)
      const res = doel
        ? await zetOfferteGewonnenUitBericht({
            berichtId,
            dossierId: doel.dossierId,
            medewerkerId: null,
            behandelaarId: postbus.standaard_behandelaar_id,
            opdrachtReferentie: velden.opdrachtReferentie,
            opdrachtdatum: velden.opdrachtdatum ?? geclaimd.ontvangen_op.slice(0, 10),
            klantOpmerkingen: velden.klantOpmerkingen,
            relatieId: afz.relatieId,
            contactpersoonId: afz.contactpersoonId,
          })
        : { ok: false, error: 'De offerte was bij het uitvoeren niet meer te vinden.' }

      if (!res.ok) {
        await supabase.from('mailintake_berichten')
          .update({ status: 'wacht_op_mens', laatste_fout: res.error ?? null }).eq('id', berichtId)
        await voorleggen(postbus, berichtId, geclaimd, `De offerte kon niet op gewonnen: ${res.error ?? 'onbekende fout'}`)
        return { ...uit, status: 'wacht_op_mens', fout: res.error ?? null, reden: 'Offerte winnen mislukt; voorgelegd.' }
      }
      uit.status = 'verwerkt'
      uit.automatisch = true
    } else {
      uit.status = besluit.status
      await meldVoorgelegd(postbus, berichtId, geclaimd, afz.score, ex.data.soort_vertrouwen, besluit.status)
      if (besluit.status === 'wacht_op_mens') {
        await voorleggen(postbus, berichtId, geclaimd, samenvattendeReden(besluit))
      }
    }

    // ── Nabehandeling in Outlook ────────────────────────────────────────────
    if (uit.status === 'verwerkt' || uit.status === 'geen_aanvraag') {
      log.stap('nabehandeling outlook')
      await planNabehandeling(berichtId)
      await voerNabehandelingUit(berichtId)
    }

    log.klaar({ status: uit.status, automatisch: uit.automatisch })
    return uit
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e)
    const eindStatus = pogingen >= MAX_POGINGEN ? 'wacht_op_mens' : 'mislukt'
    await supabase.from('mailintake_berichten')
      .update({ status: eindStatus, pogingen, laatste_fout: melding.slice(0, 500) }).eq('id', berichtId)
    log.mislukt(e)
    return { ...uit, status: eindStatus, fout: melding, reden: 'Verwerking mislukt.' }
  }
}

/**
 * Zet een actie klaar voor de standaard behandelaar van deze postbus.
 *
 * Dit is waar "bij twijfel voorleggen" pas echt landt. Zonder deze stap belandde
 * een voorgelegd bericht alleen in het postvak, en de controletaak ging naar de
 * calculator van het dossier -- een rol die bij een vers bericht nog leeg is.
 */
async function voorleggen(
  postbus: PostbusRij,
  berichtId: string,
  bericht: { onderwerp?: string | null; van_naam?: string | null; van_adres?: string | null },
  reden: string,
): Promise<void> {
  if (!postbus.standaard_behandelaar_id) return
  const afzender = bericht.van_naam || bericht.van_adres || 'onbekende afzender'
  const res = await maakIntakeActie({
    berichtId,
    medewerkerId: postbus.standaard_behandelaar_id,
    titel: `Beoordeel ${postbus.naam.toLowerCase()} van ${afzender}`.slice(0, 200),
    toelichting: `${reden}\n\nOnderwerp: ${bericht.onderwerp ?? '(geen onderwerp)'}`,
    dagen: 2,
  })
  // Een behandelaar zonder EVA-account krijgt de actie niet te zien. Dat mag niet
  // stil blijven: het beheerscherm waarschuwt ervoor, en hier blijft het spoor staan.
  if (res.zonderOntvanger && res.taakId) {
    const supabase = createAdminClient()
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'systeem', actie: 'actie_zonder_ontvanger',
      details: { taak_id: res.taakId, behandelaar: res.toegewezenAan },
    })
  }
}

/** Notificaties bij een bericht dat is voorgelegd. */
async function meldVoorgelegd(
  postbus: PostbusRij,
  berichtId: string,
  bericht: any,
  afzenderScore: number,
  soortVertrouwen: number,
  status: string,
): Promise<void> {
  if (status === 'geen_aanvraag') return // geen ruis over ruis
  const wie = await ontvangers(postbus)
  if (!wie.length) return

  const afzender = bericht.van_naam || bericht.van_adres || 'onbekende afzender'
  let type = 'mailintake_nieuw_te_behandelen'
  let titel = `Nieuwe ${postbus.naam.toLowerCase()} van ${afzender}`

  if (afzenderScore < AFZENDER_ONBEKEND) {
    type = 'mailintake_onbekende_klant'
    titel = `Onbekende afzender: ${bericht.van_adres ?? afzender}`
  } else if (soortVertrouwen < SOORT_ONZEKER) {
    type = 'mailintake_twijfel_soort'
    titel = `Mail van ${afzender} — EVA weet niet wat dit is`
  }

  for (const w of wie) {
    await maakNotificatie({
      user_id: w.userId,
      type,
      titel,
      body: (bericht.onderwerp ?? '').slice(0, 160) || null,
      url: `/mailintake/${berichtId}`,
    })
  }
}

// ─── Batch ───────────────────────────────────────────────────────────────────

/** Zet vastgelopen claims terug. Draait vóór elke batch én in de bewakingscron. */
export async function herstelVastgelopenClaims(): Promise<number> {
  const supabase = createAdminClient()
  const grens = new Date(Date.now() - CLAIM_VERVAL_MINUTEN * 60_000).toISOString()
  const { data } = await supabase
    .from('mailintake_berichten')
    .update({ status: 'nieuw' })
    .eq('status', 'bezig')
    .lt('updated_at', grens)
    .select('id')
  return (data ?? []).length
}

export async function verwerkBatch(max = BATCH): Promise<VerwerkResultaat[]> {
  const supabase = createAdminClient()
  await herstelVastgelopenClaims()

  const { data } = await supabase
    .from('mailintake_berichten')
    .select('id')
    .in('status', ['nieuw', 'mislukt'])
    .lt('pogingen', MAX_POGINGEN)
    .order('ontvangen_op', { ascending: true })
    .limit(max)

  const uit: VerwerkResultaat[] = []
  for (const r of data ?? []) {
    uit.push(await verwerkBericht(r.id))
  }
  return uit
}
