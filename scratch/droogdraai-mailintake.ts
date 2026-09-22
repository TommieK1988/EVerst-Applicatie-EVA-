/**
 * Draait de volledige lezing opnieuw over échte post, zonder iets weg te schrijven.
 *
 *   npx tsx ../../scratch/droogdraai-mailintake.ts [aantal]   (vanuit apps/dashboard)
 *
 * WAAROM DIT NODIG IS
 * De terugblik in `toets-hoeveel-gaat-vanzelf.ts` rekent met opgeslagen scores. Die
 * zijn gemaakt met de óude prompt en de óude ijking, dus alles wat sindsdien is
 * veranderd -- het contact ter plaatse uit een bijlage, de betrokkenen, de
 * omschrijving die geen citaat meer hoeft te zijn -- kon daar alleen worden
 * nagebootst. Nagebootst is niet gemeten.
 *
 * Dit script roept daarom de echte `extraheer` aan, met de echte bijlagen uit de
 * bucket, en laat er de echte keuring, afzenderherkenning en beslissing overheen
 * lopen. Wat eruit komt is wat EVA bij de eerstvolgende ronde zou doen.
 *
 * WAT HET NIET DOET
 * Geen enkele insert of update: geen dossier, geen Bouw7-project, geen actie, geen
 * mail die verplaatst wordt. De duplicaatzoek en de Bouw7-controle lezen wel echt
 * mee, want zonder die twee is het besluit niet hetzelfde besluit.
 *
 * Het kost wél geld: elke mail gaat langs het model. Vandaar een klein aantal per
 * keer en een kostenoverzicht aan het eind.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

// `react.cache` bestaat alleen binnen de Next-runtime; buiten een request is het
// undefined en klapt elke module die het gebruikt (lib/bouw7/snapshot.ts) al bij
// het importeren. Een doorgeefluik is hier precies goed: dit script doet één ronde,
// er valt niets te cachen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const React = require('react') as any
if (typeof React.cache !== 'function') React.cache = (fn: unknown) => fn

const AANTAL = Number(process.argv[2] ?? 6)

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { extraheer, keurEnKalibreer } = await import('@/lib/mailintake/extractie')
  const { herkenAfzender, hulplijstRelaties } = await import('@/lib/mailintake/afzender')
  const { zoekDuplicaten } = await import('@/lib/mailintake/duplicaten')
  const { controleerBouw7Gereed } = await import('@/lib/mailintake/bouw7-gereed')
  const { beslis } = await import('@/lib/mailintake/beslis')
  const { domeinVan, afzenderUitDoorstuur } = await import('@/lib/mailintake/triage')
  const { beoordeelBijlage } = await import('@/lib/mailintake/bijlagen-filter')
  const { faseVoorstelVoor } = await import('@/components/dossiers/fase-plaatsing')

  const supabase = createAdminClient()

  // ── Onze eigen domeinen, voor het herkennen van doorgestuurde mail ────────
  const { data: mw } = await supabase
    .from('medewerkers').select('email').eq('actief', true).not('email', 'is', null).limit(500)
  const eigen = new Set<string>()
  for (const m of mw ?? []) { const d = domeinVan(m.email); if (d) eigen.add(d) }

  // ── Witte lijsten ─────────────────────────────────────────────────────────
  const { getBouw7Categorieen } = await import('@/lib/bouw7/create-project')
  const cats = (await getBouw7Categorieen()).map(c => ({ id: c.id, naam: c.name }))
  const { data: wms } = await supabase
    .from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').limit(50)
  const lijsten = {
    categorieen: cats,
    werkmaatschappijen: (wms ?? []).map(w => ({ id: w.id, naam: w.naam })),
  }

  // ── De berichten: de laatst beoordeelde echte post ────────────────────────
  const { data: berichten } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, van_naam, van_adres, aan, cc, ontvangen_op, body_tekst, mens_zegt_werk, status, dossier_id, postbus_id, postbus:mailintake_postbussen(soort, adres, standaard_bouw7_categorie_id)')
    .not('soort', 'is', null)
    .order('ontvangen_op', { ascending: false })
    .limit(AANTAL)

  const rijen = berichten ?? []
  console.log(`\nDroogdraai over ${rijen.length} echte berichten. Er wordt niets weggeschreven.\n`)

  let vanzelf = 0
  let voorgelegd = 0
  let buiten = 0
  let centen = 0
  // Berichten die al een dossier hebben meten te streng op de opdrachtroute: hun
  // offerte is inmiddels zélf een opdracht, dus hij is niet meer als offerte te
  // vinden. Dat is geen tekortkoming maar een gevolg van opnieuw draaien.
  let alVerwerkt = 0

  for (const b of rijen) {
    const postbus = b.postbus as unknown as {
      soort: string; adres: string; standaard_bouw7_categorie_id: number | null
    }

    const eerderVerwerkt = b.status === 'verwerkt' && b.dossier_id != null

    console.log('─'.repeat(78))
    console.log(`${b.onderwerp}${eerderVerwerkt ? '   [is al verwerkt]' : ''}`)
    console.log(`  van ${b.van_naam ?? ''} <${b.van_adres ?? ''}>  ·  postbus ${postbus?.soort}`)

    // ── Bijlagen, net als in de verwerking ──────────────────────────────────
    const { data: bijl } = await supabase
      .from('mailintake_bijlagen')
      .select('bestandsnaam, content_type, grootte_bytes, is_inline, opslag_pad, te_groot, sha256')
      .eq('bericht_id', b.id)
      .limit(100)

    const voorAI: { bestandsnaam: string; contentType: string | null; bytes: Buffer }[] = []
    const namen: string[] = []
    const gezien = new Set<string>()
    let ongelezen = false
    for (const a of bijl ?? []) {
      if (!beoordeelBijlage({
        bestandsnaam: a.bestandsnaam, contentType: a.content_type,
        grootteBytes: a.grootte_bytes, isInline: Boolean(a.is_inline),
      }).meelezen) continue
      if (a.sha256) { if (gezien.has(a.sha256)) continue; gezien.add(a.sha256) }
      namen.push(a.bestandsnaam)
      if (a.te_groot || !a.opslag_pad) { ongelezen = true; continue }
      const { data: blob } = await supabase.storage.from('mail-intake').download(a.opslag_pad)
      if (!blob) { ongelezen = true; continue }
      voorAI.push({
        bestandsnaam: a.bestandsnaam, contentType: a.content_type,
        bytes: Buffer.from(await blob.arrayBuffer()),
      })
    }

    // ── Doorgestuurd? ───────────────────────────────────────────────────────
    const vanDomein = domeinVan(b.van_adres)
    const isDoorstuur = vanDomein != null && eigen.has(vanDomein)
    const origineel = isDoorstuur ? afzenderUitDoorstuur(b.body_tekst ?? '', eigen) : null
    const echteAfzender = origineel ?? b.van_adres
    const tweedehands = isDoorstuur && origineel == null

    // ── Lezen ───────────────────────────────────────────────────────────────
    const hulplijst = await hulplijstRelaties(echteAfzender, b.onderwerp)
    const ex = await extraheer({
      postbusSoort: postbus?.soort as never,
      postbusAdres: postbus?.adres ?? '',
      onderwerp: b.onderwerp,
      vanNaam: b.van_naam,
      vanAdres: b.van_adres,
      aan: b.aan ?? [],
      cc: b.cc ?? [],
      ontvangenOp: b.ontvangen_op,
      bodyTekst: b.body_tekst ?? '',
      bekendeRelaties: hulplijst,
      mensZegtWerk: Boolean(b.mens_zegt_werk),
      bijlagenamen: namen,
      eerdereMails: [],
    }, voorAI)

    centen += ex.kostenCent

    if (!ex.ok || !ex.data) {
      console.log(`  LEZEN MISLUKT: ${ex.fout ?? 'onbekend'}${ex.storing ? ` (storing: ${ex.storing})` : ''}`)
      continue
    }

    const brontekst = [b.onderwerp, b.body_tekst].filter(Boolean).join('\n')
    const velden = await keurEnKalibreer(ex.data, lijsten, brontekst, {
      ontvangenOp: b.ontvangen_op,
      isServicedesk: ex.data.soort === 'servicedeskbon',
      standaardCategorieId: postbus?.standaard_bouw7_categorie_id ?? null,
      bijlagenGelezen: ex.gelezenBijlagen.length,
    })

    const afz = await herkenAfzender({
      vanAdres: echteAfzender,
      klantNaamUitMail: ex.data.klant_naam,
      contactpersoonNaamUitMail: ex.data.contactpersoon_naam,
      doorgestuurd: tweedehands,
    })

    const hashes = (bijl ?? []).filter(a => !a.is_inline && a.sha256).map(a => a.sha256 as string)
    const dups = await zoekDuplicaten({
      berichtId: b.id,
      relatieId: afz.relatieId,
      onderwerp: b.onderwerp,
      omschrijving: velden.omschrijving,
      straat: velden.werkadresStraat,
      postcode: velden.werkadresPostcode,
      huisnummer: velden.werkadresHuisnummer,
      referentie: velden.referentie,
      onzeReferentie: velden.onzeReferentie,
      bedrag: velden.bedragExclBtw,
      bodyTekst: b.body_tekst,
      conversationId: null,
      bijlageHashes: hashes,
    }).catch(() => [])

    const top = Math.max(0, ...dups.map(d => d.score))
    const offerte = dups.filter(d => d.soort === 'offerte_match')
    const bouw7 = await controleerBouw7Gereed({
      titel: velden.omschrijving,
      relatieId: afz.relatieId,
      contactpersoonId: afz.contactpersoonId,
      werkmaatschappijId: velden.werkmaatschappijId,
      bouw7CategorieId: velden.bouw7CategorieId,
    }).catch(() => ({ gereed: false, ontbreekt: ['Bouw7-controle mislukt'], waarschuwingen: [] }))

    const besluit = beslis({
      automatischToegestaan: true,
      soort: ex.data.soort,
      soortVertrouwen: ex.data.soort_vertrouwen,
      afzenderScore: afz.score,
      aantalRelatieKandidaten: afz.kandidaten.length,
      veldenCompleet: Boolean(afz.relatieId && velden.omschrijving && velden.bouw7CategorieId && velden.werkmaatschappijId),
      adresBevestigd: velden.adresBevestigd,
      adresCompleet: Boolean(velden.werkadresStraat && velden.werkadresStad),
      vertrouwen: velden.vertrouwen,
      duplicaatTopscore: top,
      offerteMatchGevonden: offerte.length > 0,
      regie: velden.regie,
      offerteMatchHard: offerte.length === 1 && offerte[0].score >= 0.8,
      meerdereWerkadressen: velden.meerdereWerkadressen,
      ongelezenBijlage: ongelezen,
      dagbudgetOp: false,
      bouw7Gereed: bouw7.gereed,
      bouw7Ontbreekt: bouw7.ontbreekt,
    })

    // ── Wat komt eruit ──────────────────────────────────────────────────────
    const adres = [velden.werkadresStraat, velden.werkadresHuisnummer, velden.werkadresPostcode, velden.werkadresStad]
      .filter(Boolean).join(' ')
    console.log(`  soort       ${ex.data.soort} (${Math.round(ex.data.soort_vertrouwen * 100)}%)`)
    console.log(`  klant       ${afz.relatieNaam ?? '(niet herkend)'} · ${afz.contactpersoonNaam ?? 'geen persoon'} · score ${afz.score}${tweedehands ? ' (tweedehands)' : ''}`)
    console.log(`  titel       ${velden.omschrijving ?? '-'}  [${velden.vertrouwen.omschrijving ?? 0}]`)
    console.log(`  werkadres   ${adres || '-'}${velden.adresBevestigd ? ' ✓pdok' : ''}`)
    console.log(`  ter plaatse ${velden.werkadresNaam ?? '-'} · ${velden.werkadresTelefoon ?? '-'} · ${velden.werkadresEmail ?? '-'}`)
    console.log(`  betrokkenen ${velden.betrokkenen.length ? velden.betrokkenen.map(p => `${p.naam}${p.rol ? ` (${p.rol})` : ''}`).join(' | ') : '-'}`)
    console.log(`  fase        ${faseVoorstelVoor(velden.categorieNaam, ex.data.soort)} · categorie ${velden.categorieNaam ?? '-'}`)
    console.log(`  meerdere adressen: ${velden.meerdereWerkadressen} · duplicaat ${top}`)

    if (besluit.status === 'geen_aanvraag') {
      buiten++
      console.log(`  → BUITEN EVA: ${besluit.redenen[0]}`)
    } else if (besluit.automatisch) {
      vanzelf++
      console.log(`  → GAAT VANZELF (${besluit.route})`)
    } else if (eerderVerwerkt && besluit.route === 'offerte_winnen') {
      // Telt niet mee: de offerte is al gewonnen, dus er valt niets meer te vinden.
      alVerwerkt++
      console.log('  → (telt niet mee) de offerte is al gewonnen door de vorige ronde')
    } else {
      voorgelegd++
      console.log(`  → VOORLEGGEN (${besluit.route})`)
      for (const r of besluit.redenen) console.log(`      · ${r}`)
    }
  }

  const werk = vanzelf + voorgelegd
  console.log('─'.repeat(78))
  console.log(`\nbuiten EVA     ${buiten}`)
  console.log(`gaat vanzelf   ${vanzelf} van ${werk}`)
  console.log(`voorleggen     ${voorgelegd}`)
  console.log(`telt niet mee  ${alVerwerkt} (opdracht waarvan de offerte al gewonnen is)`)
  if (werk) console.log(`→ ${Math.round((vanzelf / werk) * 100)}% zonder mens`)
  console.log(`\nkosten van deze droogdraai: € ${(centen / 100).toFixed(2)}\n`)
}

void main().catch(e => { console.error(e); process.exit(1) })
