/**
 * Kerstkaartlijst (Exact-importsjabloon "2025-09-03 Contactpersonen.xlsx") naast de
 * contactpersonen in EVA leggen.
 *
 *   node scripts/kerstlijst-analyse.mjs           -> dry-run, schrijft scratch-kerstlijst.json
 *   node scripts/kerstlijst-analyse.mjs --apply   -> vult de lege velden bij gematchte personen
 *
 * Matchen gebeurt met meerdere signalen, want e-mail alleen is een zwakke sleutel: gedeelde
 * postbussen (info@, crediteuren@) hangen aan meerdere collega's tegelijk. Regels:
 *
 *   - een persoonlijk e-mailadres telt zwaar, een postbusadres telt niet mee;
 *   - de achternaam moet kloppen (gelijk of één tikfout) tenzij het persoonlijke adres al matcht;
 *   - een kandidaat bij de herkende relatie wint van dezelfde naam bij een ander bedrijf;
 *   - kandidaten die geen mens zijn (soort <> 'persoon') vallen af.
 *
 * Aanvullen is strikt additief: een veld dat in EVA al gevuld is blijft staan, en elk veld dat
 * hier geschreven wordt gaat in `handmatige_velden` zodat de Bouw7-sync het niet terugdraait.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import XLSX from 'xlsx'

const APPLY = process.argv.includes('--apply')
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

async function sbAll(path, pageSize = 1000) {
  const alles = []
  for (let van = 0; ; van += pageSize) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...sbHeaders, Range: `${van}-${van + pageSize - 1}` } })
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
    const blok = await res.json()
    alles.push(...blok)
    if (blok.length < pageSize) return alles
  }
}
async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
}

/* -- normalisatie --------------------------------------------------- */
const stripDia = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normNaam = (s) => stripDia(s).toLowerCase().replace(/ij/g, 'y').replace(/[^a-z0-9]+/g, ' ').trim()
const normEmail = (s) => String(s || '').toLowerCase().trim()

// Gedeelde postbussen (zelfde lijst als lib/relaties/ontdubbelen.ts).
const POSTBUS = new RegExp('^(' + [
  'info', 'contact', 'mail', 'post', 'algemeen', 'secretariaat', 'administratie', 'boekhouding',
  'crediteuren', 'debiteuren', 'facturen', 'factuur', 'facturatie', 'klantcontact',
  'klantcontactcentrum', 'kcc', 'klantenservice', 'servicedesk', 'service', 'services', 'beheer',
  'vve', 'planning', 'werkvoorbereiding', 'onderhoud', 'storing', 'storingen', 'melding',
  'meldingen', 'verhuur', 'techniek', 'support', 'office', 'backoffice', 'bo', 'frontoffice',
  'balie', 'receptie', 'noreply', 'no-reply', 'denhaag', 'rotterdam', 'bureau', 'verkoop',
].join('|') + ')([.\\-_+].*)?$')
const isPostbus = (e) => (e && e.includes('@') ? POSTBUS.test(e.split('@')[0]) : false)

/** Levenshtein, afgekapt op 2 - meer dan één tikfout accepteren we toch niet. */
function afstand(a, b) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 9
  const v = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    let vorig = v[0]
    v[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const tmp = v[j + 1]
      v[j + 1] = Math.min(v[j + 1] + 1, v[j] + 1, vorig + (a[i] === b[j] ? 0 : 1))
      vorig = tmp
    }
  }
  return v[b.length]
}

const VOEGSELS = new Set(['van', 'de', 'der', 'den', 'ten', 'ter', 'te', 'v', 'vd', 'het', 'op', 'aan', 'in', 'du', 'le', 'la', 'del'])
function splitsNaam(vol) {
  const schoon = String(vol || '').trim().replace(/\s+/g, ' ')
  if (!schoon) return { voorletters: '', tussenvoegsel: '', achternaam: '' }
  const delen = schoon.split(' ')
  let i = 0
  const letters = []
  while (i < delen.length && /^([A-Za-z]\.)+$|^[A-Z]$/.test(delen[i])) letters.push(delen[i++])
  const rest = delen.slice(i)
  const tv = []
  while (rest.length > 1 && VOEGSELS.has(rest[0].toLowerCase())) tv.push(rest.shift())
  return { voorletters: letters.join(''), tussenvoegsel: tv.join(' '), achternaam: rest.join(' ') }
}

/** "van der Rassel" -> "rassel": EVA zet het tussenvoegsel niet altijd in een eigen veld. */
function kaleAchternaam(achternaam, tussenvoegsel) {
  const delen = `${tussenvoegsel || ''} ${achternaam || ''}`.trim().split(/\s+/).filter(Boolean)
  while (delen.length > 1 && VOEGSELS.has(delen[0].toLowerCase())) delen.shift()
  return normNaam(delen.join(' '))
}

/** "M.P.M." of "K.J." is geen voornaam maar een reeks initialen. */
const isInitialen = (s) => !!s && /^(?:[A-Za-z]\.\s*){1,4}$|^(?:[A-Z]\s+){0,3}[A-Z]$/.test(String(s).trim())

/** 06-nummers uit het oude systeem staan in vijf schrijfwijzen; hier één: 06-12345678. */
function normMobiel(nr) {
  const cijfers = String(nr || '').replace(/\D/g, '').replace(/^0031/, '0').replace(/^31(?=6)/, '0')
  return /^06\d{8}$/.test(cijfers) ? `06-${cijfers.slice(2)}` : String(nr || '').trim()
}

/** "'S-GRAVENHAGE" -> "'s-Gravenhage"; een kop als "ZH" blijft hoofdletters. */
function normPlaats(p) {
  return String(p || '').trim().toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (_, pre, l) => pre + l.toUpperCase())
    .replace(/^'S-/, "'s-").replace(/\b(Zh|Nh|Nb|Gld|Ov|Ut)\b/g, (m) => m.toUpperCase())
}

const ONTDOE = /\b(b ?v|v ?o ?f|n ?v|holding|beheer|groep|group|stichting)\b/g
const relSleutel = (naam) => normNaam(naam).replace(ONTDOE, '').replace(/\s+/g, ' ').trim()

/* -- Excel ---------------------------------------------------------- */
const XLS = 'C:/Users/t.kamminga/OneDrive - Everts Groep/Management Team - Documenten/02 Organisatieprojecten/2025 - Exact Bouw implementatie/Import Sjablonen/2025-09-03 Contactpersonen.xlsx'
const wb = XLSX.readFile(XLS)
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }).map((r, i) => ({
  rij: i + 2,
  relCode: String(r['RelCode'] || '').trim(),
  bedrijf: String(r['Bedrijfsnaam'] || '').trim(),
  relCodeCp: String(r['RelCode Cp'] || '').trim(),
  volnaam: String(r['Contactpersoon'] || '').trim(),
  voornaam: String(r['Voornaam'] || '').trim(),
  email: normEmail(r['E-mail']),
  mobiel: String(r['Mobiel'] || '').trim().replace(/\s+/g, ' '),
  straat: String(r['Priveadres'] || '').trim().replace(/\s+/g, ' '),
  postcode: String(r['Adressen.Postcode_1'] || '').trim(),
  plaats: String(r['Adressen.Gemeente'] || '').trim(),
  branche: String(r['Branche.Omschrijving'] || '').trim(),
  ...splitsNaam(r['Contactpersoon']),
}))

/* -- EVA ------------------------------------------------------------ */
const cps = await sbAll('contactpersonen?select=id,voornaam,tussenvoegsel,achternaam,voorletter,email,telefoon,mobiel,prive_email,prive_telefoon,prive_adres_straat,prive_adres_postcode,prive_adres_plaats,actief,soort,bouw7_id,samengevoegd_in,handmatige_velden&order=id')
const koppel = await sbAll('contactpersoon_organisaties?select=contactpersoon_id,organisatie_id,email,telefoon,mobiel,is_primair,functie&order=id')
const relaties = await sbAll('relaties?select=id,naam,actief,types,bouw7_id&order=id')

const relById = new Map(relaties.map((r) => [r.id, r]))
const orgVanCp = new Map()
for (const k of koppel) {
  if (!orgVanCp.has(k.contactpersoon_id)) orgVanCp.set(k.contactpersoon_id, [])
  orgVanCp.get(k.contactpersoon_id).push(k)
}
const levend = cps.filter((c) => !c.samengevoegd_in)

const relOpSleutel = new Map()
for (const r of relaties) {
  const s = relSleutel(r.naam)
  if (!s) continue
  if (!relOpSleutel.has(s)) relOpSleutel.set(s, [])
  relOpSleutel.get(s).push(r)
}
function zoekRelatie(bedrijf) {
  const s = relSleutel(bedrijf)
  if (!s) return []
  if (relOpSleutel.has(s)) return relOpSleutel.get(s)
  return relaties.filter((r) => {
    const rs = relSleutel(r.naam)
    return rs.length > 4 && s.length > 4 && (rs.includes(s) || s.includes(rs))
  })
}

/* -- matchen -------------------------------------------------------- */
function kandidaatScore(e, c, relIds) {
  const evaMails = new Set([c.email, c.prive_email, ...(orgVanCp.get(c.id) || []).map((k) => k.email)].filter(Boolean).map(normEmail))
  const mailRaak = e.email && !isPostbus(e.email) && evaMails.has(e.email)

  const ea = kaleAchternaam(e.achternaam, e.tussenvoegsel)
  const ca = kaleAchternaam(c.achternaam, c.tussenvoegsel)
  const achterGelijk = ea && ca && ea === ca
  const achterBijna = ea.length >= 5 && ca.length >= 5 && afstand(ea, ca) === 1

  // Een "voornaam" die alleen uit initialen bestaat ("M.P.M.") zegt niets over de roepnaam.
  const evn = isInitialen(e.voornaam) ? '' : normNaam(e.voornaam)
  const cvn = isInitialen(c.voornaam) ? '' : normNaam(c.voornaam)
  const evl = ((e.voorletters || '') + ' ' + (isInitialen(e.voornaam) ? e.voornaam : e.voornaam.slice(0, 1))).replace(/[^A-Za-z]/g, '').toLowerCase()
  const cvl = ((c.voorletter || '') + ' ' + (c.voornaam || '')).replace(/[^A-Za-z]/g, '').toLowerCase()
  const voornaamGelijk = !!(evn && cvn && (evn === cvn || evn.startsWith(cvn) || cvn.startsWith(evn)))
  const voornaamBotst = !!(evn && cvn && !voornaamGelijk && cvn.length > 2 && evn.length > 2)
  const letterGelijk = !!(evl && cvl && evl[0] === cvl[0])
  const letterBotst = !!(evl && cvl && evl[0] !== cvl[0])

  if (!mailRaak && !achterGelijk && !achterBijna) return null
  if (c.soort !== 'persoon') return null
  if (!mailRaak && (voornaamBotst || (!voornaamGelijk && letterBotst))) return null

  let score = 0
  const redenen = []
  if (mailRaak) { score += 4; redenen.push('e-mail') }
  if (achterGelijk) { score += 3; redenen.push('achternaam') }
  else if (achterBijna) { score += 1; redenen.push('achternaam~') }
  if (voornaamGelijk) { score += 2; redenen.push('voornaam') }
  else if (letterGelijk) { score += 1; redenen.push('voorletter') }
  const orgs = (orgVanCp.get(c.id) || []).map((k) => k.organisatie_id)
  if (relIds.size && orgs.some((o) => relIds.has(o))) { score += 3; redenen.push('bedrijf') }
  if (!c.actief) score -= 1
  return { c, score, redenen }
}

const resultaat = []
for (const e of excel) {
  const relHits = zoekRelatie(e.bedrijf)
  const relIds = new Set(relHits.map((r) => r.id))
  const scores = levend.map((c) => kandidaatScore(e, c, relIds)).filter(Boolean).sort((a, b) => b.score - a.score)
  const top = scores[0] || null
  const gelijk = top ? scores.filter((s) => s.score === top.score) : []
  const zeker = !!top && top.score >= 4 && gelijk.length === 1

  const m = zeker ? top.c : null
  const kopEmail = (m && !m.email && e.email) ? e.email : null
  const kopMobiel = (m && !m.mobiel && e.mobiel) ? normMobiel(e.mobiel) : null
  const kopAdres = m && e.straat && !m.prive_adres_straat
    ? { straat: e.straat, postcode: e.postcode.toUpperCase() || null, plaats: normPlaats(e.plaats) || null }
    : null

  resultaat.push({
    ...e,
    emailIsPostbus: isPostbus(e.email),
    match: m ? {
      id: m.id,
      naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').replace(/\s+/g, ' '),
      email: m.email, mobiel: m.mobiel, actief: m.actief,
      score: top.score, redenen: top.redenen,
      orgs: (orgVanCp.get(m.id) || []).map((k) => (relById.get(k.organisatie_id) || {}).naam || k.organisatie_id),
    } : null,
    twijfel: !zeker && top ? gelijk.map((s) => ({
      id: s.c.id, naam: [s.c.voornaam, s.c.tussenvoegsel, s.c.achternaam].filter(Boolean).join(' '),
      email: s.c.email, score: s.score, redenen: s.redenen,
      orgs: (orgVanCp.get(s.c.id) || []).map((k) => (relById.get(k.organisatie_id) || {}).naam || k.organisatie_id),
    })) : [],
    aanvulling: (kopEmail || kopMobiel || kopAdres) ? { email: kopEmail, mobiel: kopMobiel, adres: kopAdres } : null,
    relatieHits: relHits.map((r) => ({ id: r.id, naam: r.naam, actief: r.actief, types: r.types })),
    relatieCps: relHits.flatMap((r) => koppel.filter((k) => k.organisatie_id === r.id).map((k) => {
      const c = cps.find((x) => x.id === k.contactpersoon_id)
      return c ? [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ') : null
    })).filter(Boolean),
  })
}

writeFileSync(join(root, 'scratch-kerstlijst.json'), JSON.stringify({ resultaat }, null, 1))

const gem = resultaat.filter((r) => r.match)
const twijfel = resultaat.filter((r) => !r.match && r.twijfel.length)
const nieuw = resultaat.filter((r) => !r.match && !r.twijfel.length)
console.log(`Excel ${excel.length} | EVA-contactpersonen ${levend.length} | relaties ${relaties.length}`)
console.log(`Gematcht ${gem.length} | twijfel ${twijfel.length} | niet in EVA ${nieuw.length}`)
const aanv = gem.filter((r) => r.aanvulling)
console.log(`Aan te vullen: ${aanv.length} personen - e-mail ${aanv.filter((r) => r.aanvulling.email).length}, mobiel ${aanv.filter((r) => r.aanvulling.mobiel).length}, prive-adres ${aanv.filter((r) => r.aanvulling.adres).length}`)
console.log(`Nieuw, bedrijf herkend ${nieuw.filter((r) => r.relatieHits.length === 1).length} | meerdere relaties ${nieuw.filter((r) => r.relatieHits.length > 1).length} | geen relatie ${nieuw.filter((r) => r.relatieHits.length === 0).length}`)

if (!APPLY) {
  console.log('\nDry-run. Draai met --apply om de aanvullingen weg te schrijven.')
  process.exit(0)
}

// Dezelfde mens staat meerdere keren in de Excel (bij twee bedrijven). Eén patch per persoon,
// anders overschrijft de tweede rij wat de eerste net schreef.
const perPersoon = new Map()
for (const r of aanv) {
  const b = perPersoon.get(r.match.id)
  if (!b) { perPersoon.set(r.match.id, r); continue }
  b.aanvulling.email ||= r.aanvulling.email
  b.aanvulling.mobiel ||= r.aanvulling.mobiel
  b.aanvulling.adres ||= r.aanvulling.adres
}

let n = 0
for (const r of perPersoon.values()) {
  const huidig = cps.find((c) => c.id === r.match.id)
  const patch = {}
  const velden = new Set(huidig.handmatige_velden || [])
  // Alleen `email` staat in BOUW7_CONTACTPERSOON_VELDEN; mobiel en het privé-adres worden
  // door de sync toch niet aangeraakt, die hoeven niet in handmatige_velden.
  if (r.aanvulling.email) { patch.email = r.aanvulling.email; velden.add('email') }
  if (r.aanvulling.mobiel) patch.mobiel = r.aanvulling.mobiel
  if (r.aanvulling.adres) {
    patch.prive_adres_straat = r.aanvulling.adres.straat
    if (r.aanvulling.adres.postcode) patch.prive_adres_postcode = r.aanvulling.adres.postcode
    if (r.aanvulling.adres.plaats) patch.prive_adres_plaats = r.aanvulling.adres.plaats
  }
  patch.handmatige_velden = [...velden]
  await sbPatch(`contactpersonen?id=eq.${r.match.id}`, patch)
  n++
}
console.log(`${n} contactpersonen bijgewerkt.`)
