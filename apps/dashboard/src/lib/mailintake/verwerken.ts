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

import {
  extraheer, keurEnKalibreer,
  type BijlageVoorAI, type WitteLijsten,
} from './extractie'
import { herkenAfzender, hulplijstRelaties } from './afzender'
import { zoekDuplicaten } from './duplicaten'
import { beslis, samenvattendeReden } from './beslis'
import { zetOfferteGewonnenUitBericht } from './opdracht'
import { zoekObjectBijAdres } from './objecten'
import { controleerBouw7Gereed } from './bouw7-gereed'
import { maakWerkzaamhedenSamenvatting } from './werkzaamheden-uitvoeren'
import { domeinVan, afzenderUitDoorstuur } from './triage'
import { behandelaarVoorMail, voorleggen, meldVoorgelegd } from './melden'
import { beoordeelBijlage } from './bijlagen-filter'
import { storingTekst, type AiStoring } from './ai-storing'
import { zoekGroepVooraf, zoekGroepAchteraf, zetGroep, andereLeden } from './groeperen'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'
import { maakDossierUitBericht } from './aanmaken'
import {
  DUPLICAAT_HARD, WERK_SOORTEN,
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
  /**
   * Het lag niet aan dit bericht maar aan de AI. De batch hoort dan te stoppen: de
   * volgende mail loopt op dezelfde muur en kost alleen tijd. Zie `ai-storing.ts`.
   */
  storing?: AiStoring | null
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

/**
 * De bijlagen van één of meer berichten, klaar om mee te sturen.
 *
 * Meer dan één, want mails over dezelfde klus horen als geheel gelezen te worden:
 * de bon zit vaak in een ander bericht dan de afspraak erover. Een dubbele bijlage
 * (dezelfde bon twee keer doorgestuurd) gaat er één keer in -- ontdubbeld op
 * `sha256`, want twee keer hetzelfde bestand meesturen kost geld en helpt niets.
 */
async function bijlagenVoorAI(berichtIds: string[]): Promise<{ voorAI: BijlageVoorAI[]; namen: string[]; ongelezen: boolean }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_bijlagen')
    .select('id, bestandsnaam, content_type, grootte_bytes, is_inline, opslag_pad, te_groot, sha256')
    .in('bericht_id', berichtIds)
    .limit(100)

  const voorAI: BijlageVoorAI[] = []
  const namen: string[] = []
  const gezien = new Set<string>()
  let ongelezen = false

  for (const b of data ?? []) {
    // Ingesloten beeld filteren we hier, niet in de query: een geplakte gevelfoto
    // moet mee, het logo uit de handtekening niet. Dat onderscheid zit in de
    // grootte en de naam, en die kent alleen `beoordeelBijlage`.
    if (!beoordeelBijlage({
      bestandsnaam: b.bestandsnaam, contentType: b.content_type,
      grootteBytes: b.grootte_bytes, isInline: Boolean(b.is_inline),
    }).meelezen) continue

    if (b.sha256) {
      if (gezien.has(b.sha256)) continue
      gezien.add(b.sha256)
    }
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
    // ── Hoort dit bij een klus die al binnen is? ─────────────────────────────
    // Vóór de leesronde, want als het antwoord ja is moet die ronde meteen over
    // het geheel gaan. Dit zijn alleen de harde signalen (gesprek, dezelfde
    // bijlage, hetzelfde onderwerp); de zachte volgen na de extractie, omdat
    // daar het werkadres voor nodig is.
    log.stap('groep bepalen')
    const vooraf = await zoekGroepVooraf(berichtId).catch(() => null)
    let groepId = await zetGroep(berichtId, vooraf?.groepId ?? null)

    // Altijd kijken wie er in de groep zit, ook zonder verse treffer. Een ander
    // bericht kan zich er eerder bij hebben gezet -- en dat gebeurde ook: van twee
    // mails over dezelfde klus werd de eerste netjes over het geheel gelezen, en las
    // de tweede daarna alsnog alleen zichzelf, omdat hij op "heb ik zojuist een
    // treffer gevonden" keek in plaats van op "wie hoort hier bij".
    let eerdere = await andereLeden(groepId, berichtId).catch(() => [])
    let groepReden = vooraf?.reden ?? (eerdere.length > 0 ? 'Hoort bij een klus die al binnen is' : null)

    // ── Bijlagen ────────────────────────────────────────────────────────────
    log.stap('bijlagen laden')
    const { voorAI, namen, ongelezen } = await bijlagenVoorAI(
      [berichtId, ...eerdere.map(m => m.id)],
    )

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

    const basisContext = {
      postbusSoort: postbus.soort,
      postbusAdres: postbus.adres,
      onderwerp: geclaimd.onderwerp,
      vanNaam: geclaimd.van_naam,
      vanAdres: geclaimd.van_adres,
      aan: geclaimd.aan ?? [],
      cc: geclaimd.cc ?? [],
      ontvangenOp: geclaimd.ontvangen_op,
      bodyTekst: geclaimd.body_tekst ?? '',
      bekendeRelaties: hulplijst,
      mensZegtWerk: Boolean(geclaimd.mens_zegt_werk),
    }

    log.stap('AI-extractie', { bijlagen: voorAI.length, eerdereMails: eerdere.length })
    let ex = await extraheer(
      { ...basisContext, bijlagenamen: namen, eerdereMails: eerdere },
      voorAI,
    )

    uit.kostenCent = ex.kostenCent

    async function bewaarExtractie(res: typeof ex): Promise<number> {
      const { data: laatste } = await supabase
        .from('mailintake_extracties').select('versie')
        .eq('bericht_id', berichtId).eq('ronde', 'velden')
        .order('versie', { ascending: false }).limit(1).maybeSingle()
      const nr = ((laatste?.versie ?? 0) as number) + 1
      await supabase.from('mailintake_extracties').insert({
        bericht_id: berichtId,
        ronde: 'velden',
        versie: nr,
        model: res.model,
        prompt_versie: res.promptVersie,
        soort: res.data?.soort ?? null,
        // De ruwe uitvoer van het model. Wat EVA er daarna van maakte komt hieronder
        // in `gekeurde_velden` -- zonder dat onderscheid is achteraf niet te zien
        // waarom een bericht de route nam die het nam.
        velden: res.data ? (res.data as unknown as Json) : {},
        vertrouwen: res.data?.vertrouwen ?? {},
        toelichting: res.data?.toelichting ?? null,
        invoer_tokens: res.invoerTokens,
        uitvoer_tokens: res.uitvoerTokens,
        kosten_cent: res.kostenCent,
        status: res.ok ? 'gereed' : 'mislukt',
        fout: res.fout,
        ruwe_uitvoer: res.ruweUitvoer,
      })
      return nr
    }

    let volgende = await bewaarExtractie(ex)

    // Vastleggen wélke bijlagen het model werkelijk onder ogen kreeg. Dit stond in
    // het datamodel maar werd nergens geschreven, dus `aan_ai_gegeven` was altijd
    // false -- en daarmee onbruikbaar om te controleren of EVA de bon had gelezen.
    if (ex.gelezenBijlagen.length > 0) {
      await supabase.from('mailintake_bijlagen')
        .update({ aan_ai_gegeven: true })
        .eq('bericht_id', berichtId)
        .in('bestandsnaam', ex.gelezenBijlagen)
        .then(() => undefined, () => undefined)
    }

    if (!ex.ok || !ex.data) {
      // ── Ligt het aan de AI of aan deze mail? ──
      // Bij een storing gaat het bericht terug in de wachtrij met de poging
      // teruggedraaid: het is niet geprobeerd, het kwam niet eens aan. Zou het als
      // mislukking tellen, dan is elke wachtende mail na drie ronden "voorgelegd"
      // met een stuk JSON erbij -- terwijl er niets met die mails mis is.
      if (ex.storing) {
        await supabase.from('mailintake_berichten').update({
          status: 'nieuw', pogingen: geclaimd.pogingen ?? 0,
          laatste_fout: storingTekst(ex.storing),
        }).eq('id', berichtId)
        log.mislukt(`AI-storing (${ex.storing.soort}): ${ex.fout ?? ''}`)
        return {
          ...uit, status: 'nieuw', fout: ex.fout, storing: ex.storing,
          reden: storingTekst(ex.storing),
        }
      }

      // De AI viel om op dít bericht. Niet weggooien: leg het voor, met de fout erbij.
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
    // Na de wacht hierboven staat vast dat er een formulier is. Het in een eigen
    // variabele zetten is nodig omdat `ex` verderop vervangen kan worden door de
    // ronde over de hele klus -- TypeScript laat de zekerheid dan los.
    let gelezen: NonNullable<typeof ex.data> = ex.data

    const afz = await herkenAfzender({
      vanAdres: echteAfzender,
      klantNaamUitMail: gelezen.klant_naam,
      // Nodig om te kiezen bij een gedeeld postbusadres van een beheerkantoor.
      contactpersoonNaamUitMail: gelezen.contactpersoon_naam,
      doorgestuurd: isDoorstuur,
    })

    // ── Keuren ──────────────────────────────────────────────────────────────
    log.stap('velden keuren')
    const lijsten = await witteLijsten()
    // De tekst waartegen de keuring de onderbouwing van het model afzet. Die moet álle
    // mail van deze klus bevatten: het model leest ze als geheel, dus een citaat uit de
    // ene mail mag niet sneuvelen omdat het in de andere staat. Precies dat kostte hier
    // het regie-kenmerk van een opdracht die letterlijk zei dat het regiewerk was.
    const ontvangenOp = geclaimd.ontvangen_op
    const eigenTekst = `${geclaimd.onderwerp ?? ''}\n${geclaimd.body_tekst ?? ''}`
    async function keur(res: typeof gelezen) {
      const brontekst = [
        eigenTekst,
        ...eerdere.map(m => `${m.onderwerp ?? ''}\n${m.bodyTekst ?? ''}`),
      ].join('\n')
      return keurEnKalibreer(res, lijsten, brontekst, {
        ontvangenOp,
        // Op de inhoud en niet op de bus: een offerteaanvraag die per ongeluk naar
        // servicedesk@ is gestuurd hoort geen servicedeskcategorie te krijgen.
        isServicedesk: res.soort === 'servicedeskbon',
        standaardCategorieId: postbus.standaard_bouw7_categorie_id,
        // De tekst van een PDF staat nergens in `brontekst`; de keuring moet weten dat
        // er bijlagen gelezen zijn om een citaat daaruit niet als verzinsel te wegen.
        bijlagenGelezen: ex.gelezenBijlagen.length,
      })
    }

    let velden = await keur(gelezen)

    // ── Hoort dit tóch bij een klus die al binnen is? ────────────────────────
    // Nu pas bruikbaar: deze signalen leunen op het werkadres en de
    // opdrachtreferentie, en die zijn er voor de leesronde nog niet. Blijkt het
    // bericht bij een bestaande groep te horen, dan is het formulier hierboven op
    // de halve gegevens ingevuld en wordt er één keer opnieuw gelezen -- nu over
    // het geheel. Eén keer, niet in een lus: deze tweede ronde kijkt zelf niet
    // meer naar groepen.
    if (eerdere.length === 0 && !budgetOp) {
      const achteraf = await zoekGroepAchteraf(berichtId, {
        relatieId: afz.relatieId,
        straat: velden.werkadresStraat,
        huisnummer: velden.werkadresHuisnummer,
        opdrachtReferentie: velden.opdrachtReferentie,
      }).catch(() => null)

      if (achteraf) {
        log.stap('opnieuw lezen over de hele klus', { reden: achteraf.reden })
        groepId = await zetGroep(berichtId, achteraf.groepId)
        groepReden = achteraf.reden
        eerdere = await andereLeden(groepId, berichtId).catch(() => [])
        const samen = await bijlagenVoorAI([berichtId, ...eerdere.map(m => m.id)])
        const opnieuw = await extraheer(
          { ...basisContext, bijlagenamen: samen.namen, eerdereMails: eerdere },
          samen.voorAI,
        )
        uit.kostenCent += opnieuw.kostenCent
        // Alleen overnemen als het gelukt is. Een mislukte tweede ronde mag de
        // eerste lezing niet wissen -- half is nog altijd beter dan niets.
        if (opnieuw.ok && opnieuw.data) {
          ex = opnieuw
          gelezen = opnieuw.data
          volgende = await bewaarExtractie(opnieuw)
          velden = await keur(gelezen)
        }
      }
    }

    if (groepReden) {
      await supabase.from('mailintake_besluiten').insert({
        bericht_id: berichtId, actor: 'systeem', actie: 'gegroepeerd',
        details: { groep_id: groepId, reden: groepReden, aantal_mails: eerdere.length + 1 },
      })
    }

    // Vastleggen wat de deterministische poort ervan maakte. Het gekalibreerde
    // vertrouwen vervangt de zelfrapportage van het model: dat laatste is wat het
    // model dénkt, dit is wat we hebben kunnen controleren.
    await supabase.from('mailintake_extracties').update({
      gekeurde_velden: velden as unknown as Json,
      vertrouwen: velden.vertrouwen,
    }).eq('bericht_id', berichtId).eq('ronde', 'velden').eq('versie', volgende)

    // ── Wie hoort dit te behandelen? ────────────────────────────────────────
    // De bus waar het binnenkwam zegt niets als de afzender zich vergist heeft.
    // Een servicedeskbon in opdrachten@ hoort bij de servicedeskbehandelaar.
    const behandelaarId = await behandelaarVoorMail(postbus, gelezen.soort as MailSoort)

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
      straat: velden.werkadresStraat,
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

    // ── Scope-samenvatting ──────────────────────────────────
    // Vóór de beslissing, niet erna. De scope hoort bij "volledig invullen": stond
    // hij na de statuswissel, dan kreeg de behandelaar een bericht voorgelegd waar
    // het belangrijkste veld nog leeg was en een seconde later alsnog invulde. Wie
    // op dat moment keek, zag een halve aanvraag.
    //
    // Voor élke mail die over werk gaat, niet alleen een offerteaanvraag. Dit is de
    // ronde die álle bijlagen ruim doorleest; hem overslaan betekende dat EVA bij een
    // opdrachtbon alleen de krappe veldextractie zag en op die halve lezing ging
    // routeren en uitsluiten. De bon blijkt in de praktijk ook zelden één regel:
    // hij verwijst naar een bestek, noemt voorwaarden en stelt eisen aan de uitvoering.
    //
    // Faalt de samenvatting, dan gaat het bericht gewoon door — een scope is nooit
    // belangrijk genoeg om een aanvraag op te laten sneuvelen.
    if (gelezen.soort != null && WERK_SOORTEN.includes(gelezen.soort)) {
      log.stap('werkzaamheden samenvatten')
      const wz = await maakWerkzaamhedenSamenvatting(berichtId).catch(() => null)
      if (wz) uit.kostenCent += wz.kostenCent
    }

    // ── Beslissen ───────────────────────────────────────────────────────────
    const veldenCompleet = Boolean(
      afz.relatieId && velden.omschrijving && velden.werkmaatschappijId && velden.bouw7CategorieId &&
      velden.werkadresStraat && velden.werkadresHuisnummer && velden.werkadresPostcode && velden.werkadresStad,
    )

    const besluit = beslis({
      automatischToegestaan: postbus.automatisch_aanmaken,
      soort: gelezen.soort as MailSoort,
      soortVertrouwen: gelezen.soort_vertrouwen,
      afzenderScore: afz.score,
      aantalRelatieKandidaten: afz.relatieId ? 1 : afz.kandidaten.length,
      veldenCompleet,
      adresBevestigd: velden.adresBevestigd,
      vertrouwen: velden.vertrouwen,
      duplicaatTopscore: topscore,
      offerteMatchGevonden,
      offerteMatchHard,
      regie: velden.regie,
      meerdereWerkadressen: velden.meerdereWerkadressen,
      ongelezenBijlage: ongelezen || ex.overgeslagenBijlagen.length > 0,
      dagbudgetOp: budgetOp,
      bouw7Gereed: bouw7.gereed,
      bouw7Ontbreekt: bouw7.ontbreekt,
      // Uit het archief teruggehaald: de ruis-uitgang blijft dan dicht.
      mensZegtWerk: Boolean(geclaimd.mens_zegt_werk),
    })

    uit.reden = samenvattendeReden(besluit)

    await supabase.from('mailintake_berichten').update({
      soort: gelezen.soort,
      soort_vertrouwen: gelezen.soort_vertrouwen,
      samenvatting: gelezen.samenvatting,
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
        soort: gelezen.soort, soort_vertrouwen: gelezen.soort_vertrouwen,
        afzender_score: afz.score, herkend_via: afz.via,
        duplicaat_topscore: topscore, redenen: besluit.redenen,
        object_id: objectTreffer.objectId, object_via: objectTreffer.via,
        bouw7_gereed: bouw7.gereed, bouw7_ontbreekt: bouw7.ontbreekt,
        kosten_cent: ex.kostenCent,
      },
    })

    // ── Uitvoeren ───────────────────────────────────────────────────────────
    if (besluit.automatisch && besluit.route === 'nieuw_dossier' && afz.relatieId) {
      log.stap('dossier aanmaken')

      // De drie delen van de omschrijving staan bij het bericht: de scope-ronde
      // hierboven heeft ze daar net weggeschreven. Zonder dit zou een automatisch
      // dossier in Bouw7 met een lege Omschrijving landen.
      const { data: delen } = await supabase
        .from('mailintake_berichten')
        .select('gevraagde_werkzaamheden, buiten_scope, aandachtspunten')
        .eq('id', berichtId)
        .maybeSingle()

      const res = await maakDossierUitBericht({
        berichtId,
        relatieId: afz.relatieId,
        contactpersoonId: afz.contactpersoonId,
        velden,
        objectId: objectTreffer.objectId,
        gevraagdeWerkzaamheden: delen?.gevraagde_werkzaamheden ?? null,
        omschrijving: {
          scope: delen?.gevraagde_werkzaamheden ?? null,
          buitenScope: delen?.buiten_scope ?? null,
          aandachtspunten: delen?.aandachtspunten ?? null,
        },
        automatisch: true,
        medewerkerId: null,
        behandelaarId,
      })
      if (!res.ok) {
        await supabase.from('mailintake_berichten')
          .update({ status: 'wacht_op_mens', laatste_fout: res.error }).eq('id', berichtId)
        await voorleggen(postbus, behandelaarId, berichtId, geclaimd,
          ['EVA kon het dossier niet zelf aanmaken: ' + (res.error ?? 'onbekende fout')],
          { velden, relatieNaam: afz.relatieNaam, soort: gelezen.soort })
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
            behandelaarId,
            opdrachtReferentie: velden.opdrachtReferentie,
            opdrachtdatum: velden.opdrachtdatum ?? geclaimd.ontvangen_op.slice(0, 10),
            klantOpmerkingen: velden.klantOpmerkingen,
            regie: velden.regie,
            relatieId: afz.relatieId,
            contactpersoonId: afz.contactpersoonId,
            werkadres: {
              straat: velden.werkadresStraat, huisnummer: velden.werkadresHuisnummer,
              postcode: velden.werkadresPostcode, stad: velden.werkadresStad,
              naam: velden.werkadresNaam, telefoon: velden.werkadresTelefoon,
              email: velden.werkadresEmail,
            },
            betrokkenen: velden.betrokkenen ?? [],
          })
        : { ok: false, error: 'De offerte was bij het uitvoeren niet meer te vinden.' }

      if (!res.ok) {
        await supabase.from('mailintake_berichten')
          .update({ status: 'wacht_op_mens', laatste_fout: res.error ?? null }).eq('id', berichtId)
        await voorleggen(postbus, behandelaarId, berichtId, geclaimd,
          [`De offerte kon niet op gewonnen gezet worden: ${res.error ?? 'onbekende fout'}`],
          { velden, relatieNaam: afz.relatieNaam, soort: gelezen.soort })
        return { ...uit, status: 'wacht_op_mens', fout: res.error ?? null, reden: 'Offerte winnen mislukt; voorgelegd.' }
      }
      uit.status = 'verwerkt'
      uit.automatisch = true
    } else {
      uit.status = besluit.status
      // Eerst de actie: die meldt zichzelf bij de behandelaar. `meldVoorgelegd` slaat
      // hem daarna over, zodat één binnengekomen bericht niet twee belletjes geeft.
      let alGemeldAan: string | null = null
      if (besluit.status === 'wacht_op_mens') {
        const voorgelegd = await voorleggen(postbus, behandelaarId, berichtId, geclaimd, besluit.redenen,
          { velden, relatieNaam: afz.relatieNaam, soort: gelezen.soort })
        alGemeldAan = voorgelegd.gemeldAan
      }
      await meldVoorgelegd(postbus, berichtId, geclaimd, afz.score, gelezen.soort_vertrouwen, besluit.status, alGemeldAan)
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
 * Wie behandelt dit bericht, gezien wat het is?
 *
 * Post belandt regelmatig in de verkeerde bus. Hoort de inhoud bij een andere
 * postbus dan waar hij binnenkwam, dan pakken we de behandelaar van díé bus --
 * een storing hoort bij de servicedesk, ook als hij naar opdrachten@ is gestuurd.
 * Bestaat die bus niet of heeft hij geen behandelaar, dan blijft de bus van
 * binnenkomst leidend; liever iemand dan niemand.
 *
 * De meldingen blijven wél bij de mensen die de ontvangende bus in de gaten
 * houden: dat is hun mailbox, en zij horen te weten wat erin kwam.
 */
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
    const res = await verwerkBericht(r.id)
    uit.push(res)

    // Stoppen bij een storing. De volgende mail loopt op dezelfde muur; doorgaan
    // levert niets op en kost bij een rate limit alleen maar meer afwijzingen.
    if (res.storing) {
      await meldAiStoring(res.storing, r.id)
      break
    }
  }
  return uit
}

/**
 * Meldt één keer dat de mailintake stilligt.
 *
 * Eén keer per zes uur, want de cron draait elke tien minuten en niemand wordt
 * geholpen door zesendertig belletjes met dezelfde boodschap. De ontdubbeling
 * loopt via het besluitenlog: dat is append-only en staat er toch al.
 */
async function meldAiStoring(storing: AiStoring, berichtId: string): Promise<void> {
  const supabase = createAdminClient()
  const grens = new Date(Date.now() - 6 * 3600 * 1000).toISOString()

  const { data: eerder } = await supabase
    .from('mailintake_besluiten')
    .select('id')
    .eq('actie', 'ai_storing')
    .gte('moment', grens)
    .limit(1)
  if (eerder?.length) return

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'systeem', actie: 'ai_storing',
    details: { soort: storing.soort, uitleg: storing.uitleg },
  })

  // Naar wie de postbussen in de gaten houdt. Zij merken het anders pas doordat er
  // niets meer binnenkomt, en dat is precies de stille storing die deze module
  // hoort te voorkomen.
  const { data: postbussen } = await supabase
    .from('mailintake_postbussen')
    .select('notificatie_medewerkers')
    .eq('actief', true)
    .limit(20)

  const ids = [...new Set((postbussen ?? []).flatMap(p => p.notificatie_medewerkers ?? []))]
  if (!ids.length) return

  const { data: mensen } = await supabase
    .from('medewerkers').select('auth_user_id')
    .in('id', ids).eq('actief', true).not('auth_user_id', 'is', null).limit(50)

  const { maakNotificatie } = await import('@/lib/notificaties/maak')
  for (const m of mensen ?? []) {
    await maakNotificatie({
      user_id: m.auth_user_id as string,
      type: 'mailintake_ai_storing',
      titel: 'De mailintake ligt stil',
      body: storing.uitleg,
      url: '/mailintake',
    }).catch(() => undefined)
  }
}
