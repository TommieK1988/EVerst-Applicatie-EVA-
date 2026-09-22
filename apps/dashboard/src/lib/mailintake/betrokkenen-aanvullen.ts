import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { normaliseerPersoon } from './afzender'

/**
 * mailintake/betrokkenen-aanvullen.ts
 *
 * De mensen die in een opdracht genoemd worden bij het dossier zetten.
 *
 * WAAROM
 * Een opdrachtbon noemt zelden één persoon. Er staat een beheerder die tekent, een
 * technisch manager die het werk begeleidt, een opzichter namens de corporatie, en
 * onderaan de melder met zijn eigen telefoonnummer. Tot nu toe bewaarde EVA daar
 * precies één van — de contactpersoon van de opdrachtgever — en verdween de rest in
 * de mailtekst. Dan belt de uitvoerder het kantoor terwijl de naam van de man met
 * de sleutel gewoon in de bon stond.
 *
 * DE REGEL
 * **EVA voegt alleen mensen toe die al bestaan.** Een betrokkene is een verwijzing
 * naar een `contactpersoon`, geen vrij tekstveld, en dat is maar goed ook: een naam
 * uit een PDF is niet te controleren. Wie niet tussen de contactpersonen van deze
 * klant staat, wordt dus niet aangemaakt maar teruggemeld — die tekst komt via de
 * klantnotitie toch al op het dossier terecht, en een mens kan hem daar met één
 * klik echt aanmaken.
 *
 * HOE ER GEMATCHT WORDT
 * Eerst op e-mailadres, want dat is eenduidig. Anders op achternaam, en alleen als
 * die naar precies één persoon wijst. Twee mensen met dezelfde achternaam bij
 * dezelfde beheerder leveren geen keuze op maar een overslag; dat is dezelfde
 * afweging als bij het gedeelde postbusadres in `afzender.ts`.
 *
 * Deze functie gooit niet. Hij draait als nazorg bij een opdracht die al verwerkt
 * is, en een naam die niet gevonden wordt mag die verwerking niet omverhalen.
 */

export interface GenoemdePersoon {
  naam: string
  rol?: string | null
  email?: string | null
  telefoon?: string | null
}

export interface BetrokkenenResultaat {
  /** Wie er is toegevoegd, met de rol zoals die in de mail stond. */
  toegevoegd: { naam: string; rol: string | null }[]
  /** Wie er genoemd werd maar niet bij deze klant bekend is. */
  nietGevonden: string[]
  /** Wie er al bij het dossier stond; geen fout, alleen geen actie. */
  stondenAl: string[]
}

const LEEG: BetrokkenenResultaat = { toegevoegd: [], nietGevonden: [], stondenAl: [] }

type KandidaatRij = {
  id: string
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
  email: string | null
}

const volledig = (cp: KandidaatRij) =>
  [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ').trim()

/**
 * Zoekt de persoon uit `kandidaten` die bij `genoemd` hoort, of null.
 *
 * Losstaand zodat de keuze te toetsen is zonder database: dit is de plek waar een
 * verkeerde match een verkeerde naam op een dossier zet.
 */
export function kiesBetrokkene(
  genoemd: GenoemdePersoon,
  kandidaten: KandidaatRij[],
  extraEmails: Map<string, string[]>,
): KandidaatRij | null {
  const email = (genoemd.email ?? '').trim().toLowerCase()
  if (email) {
    const opEmail = kandidaten.filter(cp =>
      (cp.email ?? '').toLowerCase() === email
      || (extraEmails.get(cp.id) ?? []).includes(email))
    // Een gedeeld postbusadres wijst naar meerdere mensen en bewijst dan niets.
    if (opEmail.length === 1) return opEmail[0]
  }

  const woorden = normaliseerPersoon(genoemd.naam).split(' ').filter(w => w.length >= 3)
  if (!woorden.length) return null

  const opNaam = kandidaten.filter(cp => {
    const kaal = normaliseerPersoon(volledig(cp)).split(' ')
    return woorden.some(w => kaal.includes(w))
  })
  return opNaam.length === 1 ? opNaam[0] : null
}

export async function vulBetrokkenenAan(inv: {
  dossierId: string
  /** De opdrachtgever; alleen bij díé relatie wordt gezocht. */
  relatieId: string | null
  genoemd: GenoemdePersoon[]
}): Promise<BetrokkenenResultaat> {
  const namen = (inv.genoemd ?? []).filter(p => (p.naam ?? '').trim().length >= 2).slice(0, 10)
  if (!inv.relatieId || !namen.length) return LEEG

  const supabase = createAdminClient()

  // Begrensd op deze ene relatie, dus ver onder de PostgREST-grens van 1000.
  const { data: koppels } = await supabase
    .from('contactpersoon_organisaties')
    .select('contactpersoon_id, email, contactpersoon:contactpersonen(id, voornaam, tussenvoegsel, achternaam, email, actief)')
    .eq('organisatie_id', inv.relatieId)
    .limit(500)

  // De embed levert `contactpersoon` als object of als array, afhankelijk van hoe
  // PostgREST de relatie ziet; beide vormen komen hier binnen.
  type KoppelRij = {
    email: string | null
    contactpersoon: (KandidaatRij & { actief: boolean | null }) | null
  }

  const kandidaten: KandidaatRij[] = []
  const extraEmails = new Map<string, string[]>()
  for (const k of (koppels ?? []) as unknown as KoppelRij[]) {
    const cp = k.contactpersoon
    if (!cp || cp.actief === false) continue
    if (!kandidaten.some(x => x.id === cp.id)) {
      kandidaten.push({
        id: cp.id, voornaam: cp.voornaam, tussenvoegsel: cp.tussenvoegsel,
        achternaam: cp.achternaam, email: cp.email,
      })
    }
    // Het adres kan per organisatie afwijken van het adres op de persoon zelf.
    const rij = (k.email ?? '').trim().toLowerCase()
    if (rij) extraEmails.set(cp.id, [...(extraEmails.get(cp.id) ?? []), rij])
  }
  if (!kandidaten.length) return { ...LEEG, nietGevonden: namen.map(p => p.naam) }

  // Wie al op het dossier staat, hoeft er niet nog eens bij. De contactpersoon van
  // de opdrachtgever staat sowieso al in het blok Betrokkenen; die is afgeleid.
  const [{ data: dossier }, { data: bestaand }] = await Promise.all([
    supabase.from('dossiers').select('contactpersoon_id').eq('id', inv.dossierId).maybeSingle(),
    supabase.from('dossier_betrokkenen').select('contactpersoon_id').eq('dossier_id', inv.dossierId).limit(200),
  ])
  const alAanwezig = new Set<string>(
    [dossier?.contactpersoon_id, ...(bestaand ?? []).map((r: any) => r.contactpersoon_id)]
      .filter(Boolean) as string[],
  )

  const uit: BetrokkenenResultaat = { toegevoegd: [], nietGevonden: [], stondenAl: [] }
  const dezeRonde = new Set<string>()

  for (const p of namen) {
    const treffer = kiesBetrokkene(p, kandidaten, extraEmails)
    if (!treffer) { uit.nietGevonden.push(p.naam.trim()); continue }
    if (alAanwezig.has(treffer.id) || dezeRonde.has(treffer.id)) {
      uit.stondenAl.push(volledig(treffer) || p.naam.trim())
      continue
    }

    const rol = (p.rol ?? '').trim().slice(0, 80) || null
    const { error } = await supabase.from('dossier_betrokkenen').insert({
      dossier_id: inv.dossierId,
      contactpersoon_id: treffer.id,
      rol,
      // De herkomst hoort erbij te staan: iemand die dit later leest moet kunnen
      // zien dat EVA deze naam uit een bon heeft en niet van een collega.
      opmerkingen: 'Uit de opdracht per e-mail overgenomen.',
    } as never)

    if (error) {
      // 23505 = de partiële unieke index; dan stond hij er toch al.
      if (error.code === '23505') uit.stondenAl.push(volledig(treffer) || p.naam.trim())
      else uit.nietGevonden.push(p.naam.trim())
      continue
    }

    dezeRonde.add(treffer.id)
    uit.toegevoegd.push({ naam: volledig(treffer) || p.naam.trim(), rol })
  }

  return uit
}
