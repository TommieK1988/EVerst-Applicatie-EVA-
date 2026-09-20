/**
 * Afwijkende factuuradressen die als contactpersoon zijn aangemaakt, rechttrekken.
 *
 * Een VvE die door een beheerder wordt bestuurd is de partij die de factuur betaalt, maar stond
 * in Bouw7 als "contactpersoon" onder die beheerder. Zo'n rij kun je niet als opdrachtgever op
 * een project zetten en niet factureren. Dit script maakt er een echt contact van (contacttype
 * `customer` = Klant) en verwijdert daarna de contactpersoon.
 *
 * In september 2026 stonden er nog acht van; de rest was in Bouw7 al opgeruimd (die kant zit in
 * `scripts/onderzoek-contactpersonen-verdwenen.mjs` en in de opruimstap van de sync).
 *
 * De volgorde per record is niet vrijblijvend. `DELETE /contact/{contact}/contact-person` is de
 * enige onomkeerbare stap in dit script, dus die komt pas nadat is teruggelezen dat het contact
 * er écht staat met de juiste naam, het juiste adres en type 7. Faalt een tussenstap, dan wordt
 * dat record overgeslagen en blijft de contactpersoon gewoon staan.
 *
 * Leest de Bouw7-sleutel uit Supabase (tabel `integraties`), net als de andere scripts hier.
 *
 * Draaien vanuit de repo-root:
 *   node scripts/bouw7-vve-contactpersoon-naar-contact.mjs              → droogloop
 *   node scripts/bouw7-vve-contactpersoon-naar-contact.mjs --apply      → voert het uit
 *   node scripts/bouw7-vve-contactpersoon-naar-contact.mjs --only=483206
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').split('=')[1] || null
const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Het werkplan, per Bouw7-contactpersoon-id. Handmatig vastgesteld en met Tom doorgenomen —
 * bewust geen automatische herkenning: bij "Nationaal Grondbezit B.V." en "VvE Willem de
 * Zwijgerlaan II" hangt het van de administratie af of er al een contact voor bestaat, en een
 * verkeerd oordeel levert een duplicaat in de stamgegevens op.
 *
 *   actie 'hergebruik' → bestaat al als contact; alleen de contactpersoon opruimen
 *   actie 'aanmaken'   → nieuw contact, dan de contactpersoon opruimen
 *
 * `naam` is de contactnaam in de Bouw7-huisstijl (administratienummer vooraan, streepje ertussen,
 * geen "p/a"), niet de rommelige contactpersoonnaam.
 */
const PLAN = {
  438922: { actie: 'hergebruik', reden: 'Hoort bij een bestaand Havenkwartier-contact (Tom, sep 2026); nummer nog te bevestigen' },
  447372: { actie: 'hergebruik', contact: 3551202, reden: 'Stichting Panta Rhei' },
  449113: { actie: 'hergebruik', contact: 3815528, reden: 'VvE Da Vinci Zuidland' },
  451916: { actie: 'hergebruik', contact: 4057103, reden: 'VvE 12322 - Willem de Zwijgerlaan II' },
  456077: { actie: 'hergebruik', contact: 3839153, reden: 'Nationaal Grondbezit B.V.' },
  449151: { actie: 'aanmaken', naam: 'VvE Kerk en Zanen te Alphen aan den Rijn', soort: 'VvE' },
  456110: { actie: 'aanmaken', naam: 'VvE Pahudstraat 122-160 Den Haag', soort: 'VvE' },
  483206: { actie: 'aanmaken', naam: 'VvE 8109 - Steenvoordelaan 269-531', soort: 'VvE' },
}

/** Bouw7-contacttype "Klant". Bouw7 publiceert geen enum en heeft geen lijst-endpoint. */
const CONTACTTYPE_KLANT = 7

// ── .env.local parsen (CRLF-veilig) ─────────────────────────────────
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env ontbreekt in apps/dashboard/.env.local')

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Supabase PATCH ${path}: ${res.status} ${await res.text()}`)
}

// ── Bouw7 ───────────────────────────────────────────────────────────
const HEIMDALL = 'https://heimdall.bouw7.nl'
let token = null

async function bouw7Login(apiKey, appName) {
  const res = await fetch(`${HEIMDALL}/auth/login/${appName}/apiKey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `apiKey=${encodeURIComponent(apiKey)}`,
  })
  if (!res.ok) throw new Error(`Bouw7 login mislukt (${res.status}): ${await res.text()}`)
  const data = await res.json()
  token = data.token ?? data.access_token ?? data
  if (typeof token !== 'string') throw new Error('Bouw7 login: geen geldig token')
}

/** GET die de status meegeeft — 404 is hier een geldig antwoord (bestaanscontrole). */
async function b7Raw(path, q) {
  const url = new URL(path, HEIMDALL)
  if (q) url.searchParams.set('q', q)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return { status: res.status, body: res.ok ? await res.json() : await res.text() }
}

async function b7(path, q) {
  const { status, body } = await b7Raw(path, q)
  if (status >= 400) throw new Error(`Bouw7 GET ${path} (${status}): ${String(body).slice(0, 200)}`)
  return body
}

async function b7Post(path, body) {
  const res = await fetch(new URL(path, HEIMDALL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Bouw7 POST ${path} (${res.status}): ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

async function b7Delete(path, body) {
  const res = await fetch(new URL(path, HEIMDALL), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Bouw7 DELETE ${path} (${res.status}): ${(await res.text()).slice(0, 400)}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

/**
 * Bouw7 eist op elk contact het maatwerkveld "Soort opdrachtgever" (keuzelijst). Zonder dat
 * veld weigert POST /contact met een 400 — zie ook `soortOpdrachtgever` in
 * apps/dashboard/src/lib/bouw7/create-contact.ts, waar dit precies zo wordt opgelost.
 */
async function soortAttribuutId() {
  const defs = (await b7('/list/custom-attributes', 'LIMIT 200')).items ?? []
  const hit = defs.find(d =>
    /soortopdrachtgever/i.test((d.propertyName ?? '').replace(/^ca/, ''))
    || /soort opdrachtgever/i.test(d.name ?? '')
  )
  return hit?.id ?? null
}

const naamVanCp = cp => `${cp.firstName ?? ''} ${cp.lastName ?? ''}`.replace(/\s+/g, ' ').trim()

async function main() {
  const [integratie] = await sbGet('integraties?naam=eq.bouw7&select=config')
  if (!integratie?.config?.api_key) throw new Error('Geen Bouw7-sleutel in de tabel integraties')
  await bouw7Login(integratie.config.api_key, integratie.config.app_name ?? 'everts-platform')

  const attrId = await soortAttribuutId()
  if (attrId == null) console.log('LET OP: maatwerkveld "Soort opdrachtgever" niet gevonden; POST /contact zal waarschijnlijk 400 geven')

  const alleCps = (await b7('/list/contact-persons', 'LIMIT 1000')).items ?? []
  if (alleCps.length === 0) throw new Error('Bouw7 gaf geen enkele contactpersoon terug — afgebroken')
  const cpById = new Map(alleCps.map(c => [String(c.id), c]))

  console.log(APPLY ? '── UITVOEREN ──\n' : '── DROOGLOOP (geen wijzigingen) ──\n')

  for (const [cpId, plan] of Object.entries(PLAN)) {
    if (ONLY && ONLY !== cpId) continue

    // 1. Bestaanscontrole. De moeder-contact-id komt uit de respons, nooit uit een aanname.
    const cp = cpById.get(cpId)
    if (!cp) { console.log(`${cpId}  OVERGESLAGEN — bestaat niet meer als contactpersoon in Bouw7\n`); continue }
    const moeder = cp.contact?.id
    if (!moeder) { console.log(`${cpId}  OVERGESLAGEN — geen moedercontact in de respons\n`); continue }

    const naam = naamVanCp(cp)
    console.log(`${cpId}  ${naam}`)
    console.log(`  onder      : ${cp.contact?.name} (${moeder})`)

    let contactId = plan.contact ?? null

    if (plan.actie === 'hergebruik') {
      console.log(`  hergebruik : ${contactId ?? '(nog te bepalen)'} — ${plan.reden}`)
      // Zonder doelcontact geen onomkeerbare delete: er is dan niets om de herkomst aan op te
      // hangen, en achteraf is niet meer na te gaan bij welke VvE deze rij hoorde.
      if (contactId == null) { console.log('  OVERGESLAGEN — doelcontact nog niet vastgesteld\n'); continue }
      // Controleer dat dat contact ook echt bestaat vóór we de contactpersoon opgeven.
      const bestaand = ((await b7('/list/contacts', `id = ${contactId}`)).items ?? [])[0]
      if (!bestaand) { console.log('  AFGEBROKEN — het hergebruikte contact bestaat niet\n'); continue }
      console.log(`  gevonden   : ${bestaand.name} [${bestaand.type?.name}]`)
    } else {
      // 2. Aanmaken. Het adres van de contactpersoon is het afwijkende factuuradres.
      const body = {
        name: plan.naam,
        contactType: { id: CONTACTTYPE_KLANT },
      }
      if (cp.streetName) body.streetName = cp.streetName.trim()
      if (cp.houseNumber) body.houseNumber = String(cp.houseNumber).trim()
      if (cp.zipCode) body.zipCode = cp.zipCode.trim()
      if (cp.city) body.city = cp.city.trim()
      if (cp.emailAddress) body.email = cp.emailAddress
      if (cp.phoneNumber) body.phoneNumber = cp.phoneNumber
      body.information = `Aangemaakt uit contactpersoon ${cpId} bij ${cp.contact?.name} — afwijkend factuuradres, ${new Date().toISOString().slice(0, 10)}.`
      if (attrId != null) {
        body.customAttributeValues = [{ customAttribute: { id: attrId }, value: plan.soort }]
      }

      console.log(`  aanmaken   : ${plan.naam}  [${[body.streetName, body.houseNumber, body.zipCode, body.city].filter(Boolean).join(' ') || 'geen adres'}]`)
      if (!APPLY) { console.log('  (droogloop — niets gedaan)\n'); continue }

      const created = await b7Post('/contact', body)
      contactId = created?.id ?? null
      if (contactId == null) { console.log('  AFGEBROKEN — POST /contact gaf geen id terug\n'); continue }

      // 3. Terugleescontrole: staat het er écht, met de juiste naam en het juiste type?
      const terug = ((await b7('/list/contacts', `id = ${contactId}`)).items ?? [])[0]
      if (!terug || terug.type?.id !== CONTACTTYPE_KLANT || terug.name !== plan.naam) {
        console.log(`  AFGEBROKEN — teruglezen klopt niet: ${JSON.stringify(terug)}`)
        console.log('  De contactpersoon blijft staan; contact handmatig nakijken.\n')
        continue
      }
      console.log(`  aangemaakt : ${contactId} ${terug.name} [${terug.type?.name}] ${[terug.streetName, terug.houseNumber, terug.zipCode, terug.city].filter(Boolean).join(' ')}`)
    }

    if (!APPLY) { console.log('  (droogloop — contactpersoon niet verwijderd)\n'); continue }

    // 4. Pas nu de onomkeerbare stap. De volledige rij eerst afdrukken.
    console.log(`  verwijderen: ${JSON.stringify(cp)}`)
    await b7Delete(`/contact/${moeder}/contact-person`, { id: Number(cpId) })

    // 5. Bestaanscontrole achteraf — 404 is het bewijs.
    const na = await b7Raw(`/contact-person/${cpId}`)
    if (na.status !== 404) {
      console.log(`  MISLUKT — contactpersoon bestaat nog (status ${na.status}); EVA niet bijgewerkt\n`)
      continue
    }
    console.log('  verwijderd : bevestigd (404)')

    // 6. EVA-kant. De rij blijft bestaan als doorverwijzing: dossiers en notities wijzen ernaar.
    const evaRijen = await sbGet(`contactpersonen?bouw7_id=eq.${cpId}&select=id,opmerkingen`)
    for (const rij of evaRijen) {
      const herkomst = `Omgezet naar Bouw7-contact ${contactId} (afwijkend factuuradres), ${new Date().toISOString().slice(0, 10)}.`
      await sbPatch(`contactpersonen?id=eq.${rij.id}`, {
        soort: 'object',
        actief: false,
        bouw7_sync_status: 'omgezet_naar_contact',
        opmerkingen: [rij.opmerkingen, herkomst].filter(Boolean).join('\n'),
      })
      console.log(`  EVA        : ${rij.id} → soort=object, actief=false`)
    }
    console.log('')
  }

  if (!APPLY) console.log('Droogloop klaar. Draai opnieuw met --apply om het uit te voeren.')
}

main().catch(e => { console.error('FOUT:', e.message); process.exit(1) })
