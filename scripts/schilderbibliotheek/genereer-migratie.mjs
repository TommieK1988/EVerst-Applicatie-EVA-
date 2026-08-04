/**
 * Genereert de datamigratie voor de schilderbibliotheek uit het Calc4You-bestand
 * en de werkomschrijvingen uit het OnderhoudNL-bestek.
 *
 *   node scripts/schilderbibliotheek/genereer-migratie.mjs \
 *        "<pad>/Bibliotheek - Onderhoud..c4y" \
 *        supabase/migrations/20260804g_schilderbibliotheek_data.sql
 *
 * Werkwijze en waarborgen:
 *  - Alles wordt geüpsert op natuurlijke sleutels (onderdeelcode, bron_code,
 *    behandelingscode). Opnieuw draaien dupliceert dus niets en behoudt de
 *    bestaande rijen — de vier pilot-onderdelen houden hun eigen id.
 *  - De spiegel-triggers worden tijdens de bulk uitgezet en daarna in één keer
 *    over alle combinaties gedraaid. Zonder dat zou de spiegel ~2.500 keer per
 *    rij herbouwen.
 *  - Naast de migratie komt er een correctierapport uit met elke ingreep op de
 *    brondata, zodat te controleren is wat er is aangepast en waarom.
 */

import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { leesC4y } from './lees-c4y.mjs'
import { leesStaartkosten } from './lees-staartkosten.mjs'
import {
  CODE_MAPPING, ONDERDELEN, CODE_CORRECTIES,
  BEHANDELING_CORRECTIES, SUFFIX_SAMENVOEGING,
} from './mapping-onderdelen.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))

/** Het uurtarief-label in `bedrijfsinstellingen.uurtarieven` dat op € 45 staat. */
const UURTARIEF_LABEL = 'Arbeid schilder'
/**
 * Calc4You geeft één samengesteld materiaalbedrag. Voor de werkbegroting moet
 * verf gescheiden zijn van non-paints (kwasten, rollers, tape, afdekmateriaal).
 * Die opbouw zit niet in het bronbestand, dus splitsen we met een vuistregel.
 */
const NON_PAINTS_AANDEEL = 0.10
const BRON = 'Calc4You Bibliotheek Onderhoud 2025'
/** Vaste id van familie 'EVT' (Everts Normbibliotheek), waar BP/BB onder komen. */
const FAMILIE_EVT = '00000000-0000-0000-0000-000000000001'

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'null' : String(Math.round(v * 10000) / 10000))

// ── Inlezen ────────────────────────────────────────────────────────────────

const [, , padC4y, padUit] = process.argv
if (!padC4y || !padUit) {
  console.error('Gebruik: node genereer-migratie.mjs <bestand.c4y> <doel.sql>')
  process.exit(1)
}

const { behandelingen, cellen, meldingen } = leesC4y(padC4y, {
  codeCorrecties: CODE_CORRECTIES,
  behandelingCorrecties: BEHANDELING_CORRECTIES,
  suffixSamenvoeging: SUFFIX_SAMENVOEGING,
})

const { recepten: staartRecepten, meldingen: staartMeldingen } = leesStaartkosten(padC4y)
const bestek = JSON.parse(readFileSync(join(HIER, 'werkomschrijvingen.json'), 'utf8'))

const rapport = [...meldingen, ...staartMeldingen]

// ── Behandelingen verrijken met het bestek ─────────────────────────────────

const ONDERGROND_UIT_CODE = { OH: 'hout', OK: 'kunststof', OM: 'metaal', OS: 'steenachtig' }

const behandelingRijen = []
let zonderBestek = 0
for (const [code, b] of behandelingen) {
  const bes = bestek[code]
  if (!bes) {
    zonderBestek++
    rapport.push(`behandeling zonder bestek-tekst: ${code} — "${b.omschrijving}"`)
  } else if (bes.bestek_titel && bes.bestek_titel !== b.omschrijving) {
    // Geen fout: de bestek-titel en de c4y-omschrijving zijn onafhankelijk
    // getypt. Wel het melden waard als ze uiteenlopen — dan is de koppeling
    // mogelijk verkeerd gelegd.
    const genormaliseerd = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[,.]/g, '').trim()
    if (genormaliseerd(bes.bestek_titel) !== genormaliseerd(b.omschrijving)) {
      rapport.push(
        `titelverschil ${code}:\n      c4y   : ${b.omschrijving}\n      bestek: ${bes.bestek_titel}`
      )
    }
  }

  behandelingRijen.push({
    code,
    naam: code,                                  // "OHD 03" — de code ís de naam
    // Het bestek is gezaghebbend voor wat een behandeling ís. Dat is niet
    // theoretisch: in Calc4You hebben OMA 02 en OMA 03 een woordelijk identieke
    // omschrijving bij verschillende prijzen; het bestek onderscheidt ze wél
    // ("1 x bijwerken dekverf" tegenover "1 x geheel dekverf").
    korte: bes?.bestek_titel || b.omschrijving,
    uitgebreid: bes?.werkomschrijving ?? null,
    ondergrond: ONDERGROND_UIT_CODE[b.ondergrond] ?? null,
    toepassing: bes?.toepassing ?? null,
    volgorde: b.volgorde,
  })
}

// ── Onderdelen en types afleiden ───────────────────────────────────────────

const gebruikteSuffixen = [...new Set(cellen.map(c => c.suffix))]

const onderdeelRijen = new Map()   // sleutel → rij
const typeRijen = []
let typeVolgorde = 0

for (const suffix of gebruikteSuffixen) {
  const m = CODE_MAPPING[suffix]
  if (!m) throw new Error(`Geen mapping voor onderdeelcode "${suffix}" — draai eerst controleer-mapping.mjs`)
  const o = ONDERDELEN[m.onderdeel]
  if (!onderdeelRijen.has(m.onderdeel)) {
    onderdeelRijen.set(m.onderdeel, { ...o, volgorde: onderdeelRijen.size + 1 })
  }
  typeRijen.push({
    onderdeelCode: o.code,
    bronCode: suffix,
    naam: m.type,
    eenheid: m.eenheid,
    volgorde: ++typeVolgorde,
  })
}

// ── SQL opbouwen ───────────────────────────────────────────────────────────

const uit = []
const P = (s = '') => uit.push(s)

P(`-- Schilderbibliotheek — normen uit Calc4You en OnderhoudNL Basisverfbestek 2020`)
P(`--`)
P(`-- GEGENEREERD door scripts/schilderbibliotheek/genereer-migratie.mjs.`)
P(`-- Niet met de hand bijwerken: pas het script of de mappingtabel aan en draai`)
P(`-- het opnieuw. Bron: ${BRON}.`)
P(`--`)
P(`-- Inhoud: ${onderdeelRijen.size} onderdelen, ${typeRijen.length} types,`)
P(`-- ${behandelingRijen.length} behandelingen, ${cellen.length} combinaties met elk een`)
P(`-- arbeidsnorm en een materiaalnorm, plus ${staartRecepten.length} staartkostenrecepten.`)
P(`--`)
P(`-- Alles upsert op natuurlijke sleutels; opnieuw draaien is veilig.`)
P()
P(`-- De spiegel-triggers zouden bij een bulk als deze duizenden keren per rij`)
P(`-- herbouwen. Ze gaan uit en draaien onderaan één keer over alle combinaties.`)
P(`alter table public.schilder_combinaties      disable trigger spiegel_combinatie;`)
P(`alter table public.schilder_arbeid_normen    disable trigger spiegel_arbeid_norm;`)
P(`alter table public.schilder_materiaal_normen disable trigger spiegel_materiaal_norm;`)
P(`alter table public.schilder_behandelingen    disable trigger spiegel_behandeling;`)
P()

// ── 1. Onderdelen ──────────────────────────────────────────────────────────
P(`-- ── Onderdelen ────────────────────────────────────────────────────────────`)
P(`insert into public.schilder_onderdelen (naam, code, ondergrond, actief, volgorde) values`)
P([...onderdeelRijen.values()]
  .map(o => `  (${q(o.naam)}, ${q(o.code)}, ${q(o.ondergrond)}, true, ${o.volgorde})`)
  .join(',\n'))
P(`on conflict (code) do update set`)
P(`  naam       = excluded.naam,`)
P(`  ondergrond = excluded.ondergrond,`)
P(`  updated_at = now();`)
P()

// ── 2. Types ───────────────────────────────────────────────────────────────
P(`-- ── Types ─────────────────────────────────────────────────────────────────`)
P(`-- \`bron_code\` is de Calc4You-onderdeelcode. Die is nodig naast \`naam\` omdat`)
P(`-- één onderdeel twee types met dezelfde naam maar een andere eenheid kan`)
P(`-- hebben: \`ho-m²\` en \`ho-m¹\` heten in de bron allebei "houten oppervlakken".`)
P(`with bron (onderdeel_code, bron_code, naam, eenheid, volgorde) as (values`)
P(typeRijen
  .map(t => `  (${q(t.onderdeelCode)}, ${q(t.bronCode)}, ${q(t.naam)}, ${q(t.eenheid)}, ${t.volgorde})`)
  .join(',\n'))
P(`)`)
P(`insert into public.schilder_types (onderdeel_id, bron_code, naam, code, eenheid, actief, volgorde)`)
P(`select o.id, b.bron_code, b.naam, b.bron_code, b.eenheid, true, b.volgorde`)
P(`  from bron b join public.schilder_onderdelen o on o.code = b.onderdeel_code`)
P(`on conflict (onderdeel_id, bron_code) do update set`)
P(`  naam       = excluded.naam,`)
P(`  eenheid    = excluded.eenheid,`)
P(`  volgorde   = excluded.volgorde,`)
P(`  updated_at = now();`)
P()

// ── 3. Behandelingen ───────────────────────────────────────────────────────
P(`-- ── Behandelingen ─────────────────────────────────────────────────────────`)
P(`-- \`korte_omschrijving\` is de systeemregel uit Calc4You ("Plaatselijk`)
P(`-- verwijderen, 1 x bijwerken grondverf, …"); \`uitgebreide_werkomschrijving\``)
P(`-- zijn de werkstappen uit het OnderhoudNL-bestek.`)
P(`insert into public.schilder_behandelingen`)
P(`  (naam, code, bron, korte_omschrijving, uitgebreide_werkomschrijving, ondergrond, toepassing, actief, volgorde) values`)
P(behandelingRijen
  .map(b => `  (${q(b.naam)}, ${q(b.code)}, ${q(BRON)}, ${q(b.korte)}, ${q(b.uitgebreid)}, ` +
            `${q(b.ondergrond)}, ${q(b.toepassing)}, true, ${b.volgorde})`)
  .join(',\n'))
P(`on conflict (code) do update set`)
P(`  bron                        = excluded.bron,`)
P(`  korte_omschrijving          = excluded.korte_omschrijving,`)
P(`  uitgebreide_werkomschrijving= coalesce(excluded.uitgebreide_werkomschrijving, public.schilder_behandelingen.uitgebreide_werkomschrijving),`)
P(`  ondergrond                  = excluded.ondergrond,`)
P(`  toepassing                  = excluded.toepassing,`)
P(`  volgorde                    = excluded.volgorde,`)
P(`  updated_at                  = now();`)
P()

// ── 4. Combinaties ─────────────────────────────────────────────────────────
P(`-- ── Combinaties (de matrixcellen) ─────────────────────────────────────────`)
P(`with bron (bron_code, onderdeel_code, type_bron_code, behandeling_code) as (values`)
P(cellen
  .map(c => {
    const m = CODE_MAPPING[c.suffix]
    return `  (${q(c.regelCode)}, ${q(ONDERDELEN[m.onderdeel].code)}, ${q(c.suffix)}, ${q(c.behandelingCode)})`
  })
  .join(',\n'))
P(`)`)
P(`insert into public.schilder_combinaties (onderdeel_id, type_id, behandeling_id, bron_code, actief)`)
P(`select o.id, t.id, h.id, b.bron_code, true`)
P(`  from bron b`)
P(`  join public.schilder_onderdelen    o on o.code = b.onderdeel_code`)
P(`  join public.schilder_types         t on t.onderdeel_id = o.id and t.bron_code = b.type_bron_code`)
P(`  join public.schilder_behandelingen h on h.code = b.behandeling_code`)
P(`on conflict (bron_code) do update set`)
P(`  onderdeel_id = excluded.onderdeel_id,`)
P(`  type_id      = excluded.type_id,`)
P(`  actief       = true,`)
P(`  updated_at   = now();`)
P()

// ── 5. Normen ──────────────────────────────────────────────────────────────
P(`-- ── Arbeids- en materiaalnormen ───────────────────────────────────────────`)
P(`-- Eerst weg, dan opnieuw: zo blijft de norm gelijk aan de bron, ook als daar`)
P(`-- iets uit verdwenen is. Alleen normen van combinaties uit déze import.`)
P(`delete from public.schilder_arbeid_normen a`)
P(` using public.schilder_combinaties k`)
P(` where a.combinatie_id = k.id and k.bron_code is not null;`)
P(`delete from public.schilder_materiaal_normen m`)
P(` using public.schilder_combinaties k`)
P(` where m.combinatie_id = k.id and k.bron_code is not null;`)
P()
P(`-- Calc4You legt de tijdnorm vast in uren per eenheid; deze tabel in minuten.`)
P(`-- \`uurtarief_label\` koppelt aan bedrijfsinstellingen.uurtarieven, zodat een`)
P(`-- tariefwijziging de hele bibliotheek meeneemt.`)
P(`with bron (bron_code, minuten, tarief, kosten, eenheid) as (values`)
P(cellen
  .map(c => `  (${q(c.regelCode)}, ${n(c.urenPerEenheid * 60)}::numeric, ${n(c.uurloon)}::numeric, ` +
            `${n(c.urenPerEenheid * c.uurloon)}::numeric, ${q(c.eenheid)})`)
  .join(',\n'))
P(`)`)
P(`insert into public.schilder_arbeid_normen`)
P(`  (combinatie_id, omschrijving, minutes_per_unit, hour_rate, cost_per_unit, unit, uurtarief_label, actief, volgorde)`)
P(`select k.id, 'Arbeid schilder', b.minuten, b.tarief, b.kosten, b.eenheid, ${q(UURTARIEF_LABEL)}, true, 1`)
P(`  from bron b join public.schilder_combinaties k on k.bron_code = b.bron_code;`)
P()
P(`-- Calc4You geeft één samengesteld materiaalbedrag per eenheid; de opbouw in`)
P(`-- losse producten zit niet in het bestand. Voor de werkbegroting is het`)
P(`-- onderscheid verf/non-paints wél nodig, dus splitsen we het bedrag met de`)
P(`-- vuistregel ${(1 - NON_PAINTS_AANDEEL) * 100}/${NON_PAINTS_AANDEEL * 100}. Non-paints is het tweede deel`)
P(`-- (kwasten, rollers, tape, schuurpapier, afdekmateriaal).`)
P(`--`)
P(`-- Het non-paints-deel is het restant na afronding, niet een tweede`)
P(`-- vermenigvuldiging: zo tellen de twee regels altijd exact op tot het`)
P(`-- oorspronkelijke bedrag, zonder centverschil.`)
P(`with bron (bron_code, prijs, eenheid) as (values`)
P(cellen
  .map(c => `  (${q(c.regelCode)}, ${n(c.materiaalPerEenheid)}::numeric, ${q(c.eenheid)})`)
  .join(',\n'))
P(`)`)
P(`insert into public.schilder_materiaal_normen`)
P(`  (combinatie_id, naam, norm_type, quantity_per_unit, eenheid, unit_price, cost_per_unit, actief, volgorde)`)
P(`select k.id, deel.naam, 'materiaal', 1, b.eenheid, deel.prijs, deel.prijs, true, deel.volgorde`)
P(`  from bron b`)
P(`  join public.schilder_combinaties k on k.bron_code = b.bron_code`)
P(`  cross join lateral (values`)
P(`    ('Verfmaterialen', round(b.prijs * ${1 - NON_PAINTS_AANDEEL}, 4), 1),`)
P(`    ('Non-paints',     b.prijs - round(b.prijs * ${1 - NON_PAINTS_AANDEEL}, 4), 2)`)
P(`  ) as deel(naam, prijs, volgorde)`)
P(` where b.prijs > 0;`)
P()

// ── 6. Triggers terug aan + spiegelen ──────────────────────────────────────
P(`-- ── Spiegel bijwerken ─────────────────────────────────────────────────────`)
P(`alter table public.schilder_combinaties      enable trigger spiegel_combinatie;`)
P(`alter table public.schilder_arbeid_normen    enable trigger spiegel_arbeid_norm;`)
P(`alter table public.schilder_materiaal_normen enable trigger spiegel_materiaal_norm;`)
P(`alter table public.schilder_behandelingen    enable trigger spiegel_behandeling;`)
P()
P(`do $spiegel$`)
P(`declare r record;`)
P(`begin`)
P(`  for r in select id from public.schilder_combinaties loop`)
P(`    perform public.spiegel_schilder_naar_recept(r.id);`)
P(`  end loop;`)
P(`end $spiegel$;`)
P()

// ── 7. Staartkosten als gewone recepten ────────────────────────────────────
P(`-- ── Staartkosten (Bouwplaats / Bereikbaarheid) ────────────────────────────`)
P(`-- Dit zijn géén genormeerde m²-prijzen maar samengestelde posten, dus ze gaan`)
P(`-- rechtstreeks naar de recepten-bibliotheek. Ze blijven gewoon bewerkbaar —`)
P(`-- alleen de gespiegelde schilderrecepten zijn vergrendeld.`)
P(`insert into public.paint_treatments (family_id, treatment_index_code, treatment_code, name, source, active) values`)
P(`  (${q(FAMILIE_EVT)}, 'BP', 'BP', 'Bouwplaatsvoorzieningen', ${q(BRON)}, true),`)
P(`  (${q(FAMILIE_EVT)}, 'BB', 'BB', 'Bereikbaarheidsvoorzieningen', ${q(BRON)}, true)`)
P(`on conflict (family_id, treatment_index_code) do update set`)
P(`  name = excluded.name, source = excluded.source, active = true;`)
P()

const staartGroepNaam = { BP: 'Bouwplaats', BB: 'Bereikbaarheid' }
P(`with bron (item_code, treatment_code, onderdeel, volnaam, eenheid) as (values`)
P(staartRecepten
  .map(r => `  (${q(r.code)}, ${q(r.groep)}, ${q(staartGroepNaam[r.groep])}, ${q(r.naam)}, ${q(r.eenheid)})`)
  .join(',\n'))
P(`)`)
P(`insert into public.paint_items`)
P(`  (family_id, treatment_id, item_code, onderdeel, type, full_name, default_unit, source, active, btw_tarief)`)
P(`select ${q(FAMILIE_EVT)}, t.id, b.item_code, b.onderdeel, 'voorziening', b.volnaam, b.eenheid, ${q(BRON)}, true, 'hoog'`)
P(`  from bron b`)
P(`  join public.paint_treatments t on t.family_id = ${q(FAMILIE_EVT)} and t.treatment_index_code = b.treatment_code`)
P(`on conflict (treatment_id, item_code) do update set`)
P(`  onderdeel = excluded.onderdeel, full_name = excluded.full_name,`)
P(`  default_unit = excluded.default_unit, source = excluded.source, active = true;`)
P()
P(`-- Normen opnieuw opbouwen voor precies deze recepten.`)
P(`delete from public.paint_labor_norms    where item_id in (select id from public.paint_items where source = ${q(BRON)});`)
P(`delete from public.paint_material_norms where item_id in (select id from public.paint_items where source = ${q(BRON)});`)
P()

const arbeidNormen = staartRecepten.flatMap(r => r.normen.filter(x => x.soort === 'arbeid').map(x => ({ r, x })))
if (arbeidNormen.length) {
  P(`with bron (item_code, naam, uren, tarief, kosten) as (values`)
  P(arbeidNormen
    .map(({ r, x }) => `  (${q(r.code)}, ${q(x.naam)}, ${n(x.urenPerEenheid)}::numeric, ${n(x.uurloon)}::numeric, ${n(x.kosten)}::numeric)`)
    .join(',\n'))
  P(`)`)
  P(`insert into public.paint_labor_norms`)
  P(`  (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate, cost_per_unit, description, active, uurtarief_label)`)
  P(`select i.id, i.treatment_id, b.item_code, 'uur', b.uren, b.tarief, b.kosten, b.naam, true, ${q(UURTARIEF_LABEL)}`)
  P(`  from bron b join public.paint_items i on i.item_code = b.item_code and i.source = ${q(BRON)};`)
  P()
}

const inkoopNormen = staartRecepten.flatMap(r => r.normen.filter(x => x.soort === 'onderaanneming').map(x => ({ r, x })))
P(`-- Elke kindregel uit het bestand wordt één norm: hoeveelheid × prijs = kosten.`)
P(`with bron (item_code, naam, eenheid, hoeveelheid, prijs, kosten) as (values`)
P(inkoopNormen
  .map(({ r, x }) => `  (${q(r.code)}, ${q(x.naam)}, ${q(x.eenheid)}, ${n(x.hoeveelheid)}::numeric, ${n(x.prijs)}::numeric, ${n(x.kosten)}::numeric)`)
  .join(',\n'))
P(`)`)
P(`insert into public.paint_material_norms`)
P(`  (item_id, treatment_id, source_code, material_name, unit, quantity_per_unit, unit_price, cost_per_unit, active, norm_type)`)
P(`select i.id, i.treatment_id, b.item_code, b.naam, b.eenheid, b.hoeveelheid, b.prijs, b.kosten, true, 'onderaanneming'`)
P(`  from bron b join public.paint_items i on i.item_code = b.item_code and i.source = ${q(BRON)};`)
P()

writeFileSync(padUit, uit.join('\n') + '\n', 'utf8')

// ── Correctierapport ───────────────────────────────────────────────────────

// Naast het script, niet in supabase/migrations — daar horen alleen migraties.
const padRapport = join(HIER, 'correctierapport.md')
const rap = []
rap.push('# Correctierapport schilderbibliotheek-import', '')
rap.push(`Bron: \`${padC4y}\``, '')
rap.push('## Aantallen', '')
rap.push(`| | |`, `|---|---|`)
rap.push(`| onderdelen | ${onderdeelRijen.size} |`)
rap.push(`| types | ${typeRijen.length} |`)
rap.push(`| behandelingen | ${behandelingRijen.length} |`)
rap.push(`| combinaties | ${cellen.length} |`)
rap.push(`| behandelingen zonder bestek-tekst | ${zonderBestek} |`)
rap.push(`| staartkostenrecepten | ${staartRecepten.length} |`)
rap.push(`| staartkostennormen | ${arbeidNormen.length + inkoopNormen.length} |`)
rap.push('')
rap.push('## Ingrepen op de brondata', '')
if (rapport.length === 0) rap.push('_Geen._')
for (const m of rapport) rap.push(`- ${m}`)
rap.push('')
rap.push('## Staartkostenrecepten', '')
for (const r of staartRecepten) {
  const som = r.normen.reduce((t, x) => t + (x.kosten || 0), 0)
  rap.push(`- **${r.code}** ${r.naam} (${r.eenheid}) — ${r.normen.length} normen, € ${som.toFixed(2)}`)
  for (const x of r.normen) rap.push(`  - ${x.soort}: ${x.naam} → € ${(x.kosten || 0).toFixed(2)}`)
}
writeFileSync(padRapport, rap.join('\n') + '\n', 'utf8')

console.log(`migratie   -> ${padUit}`)
console.log(`rapport    -> ${padRapport}`)
console.log(`${onderdeelRijen.size} onderdelen, ${typeRijen.length} types, ${behandelingRijen.length} behandelingen, ${cellen.length} combinaties, ${staartRecepten.length} staartkostenrecepten`)
console.log(`${rapport.length} ingreep(en) op de brondata — zie het rapport`)
