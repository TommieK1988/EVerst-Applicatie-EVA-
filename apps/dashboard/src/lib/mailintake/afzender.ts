/**
 * mailintake/afzender.ts
 *
 * "Kennen we deze afzender?" — de vraag die bepaalt of EVA zelf een dossier mag
 * aanmaken of het eerst voorlegt.
 *
 * De ladder stopt bij de eerste treffer. Hoe hoger de trede, hoe harder het
 * bewijs: een e-mailadres dat letterlijk aan een contactpersoon hangt is zeker,
 * een klantnaam die er ongeveer op lijkt is dat bepaald niet.
 *
 * Het model kiest hier niets. Het levert hooguit een klantnáám aan; welke relatie
 * daarbij hoort — of dat er geen bij hoort — beslist deze code.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import type { HerkendVia } from './types'
import { domeinVan, isVrijMaildomein } from './triage'

export interface AfzenderTreffer {
  relatieId: string | null
  relatieNaam: string | null
  contactpersoonId: string | null
  contactpersoonNaam: string | null
  score: number
  via: HerkendVia | null
  /** Alle kandidaten als er meer dan één in beeld was; voedt het keuzescherm. */
  kandidaten: { id: string; naam: string }[]
  toelichting: string
}

const GEEN: AfzenderTreffer = {
  relatieId: null, relatieNaam: null, contactpersoonId: null, contactpersoonNaam: null,
  score: 0, via: null, kandidaten: [], toelichting: 'Afzender niet herkend.',
}

/**
 * Normaliseert een bedrijfsnaam voor vergelijking: rechtsvormen, leestekens en
 * diacrieten eruit. "Woningstichting De Sleutel B.V." en "woningstichting de
 * sleutel bv" worden dan hetzelfde.
 */
export function normaliseerNaam(naam: string): string {
  return naam
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|c\.?v\.?|u\.?a\.?|holding|beheer(maatschappij)?)\b/g, ' ')
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Trigram-overeenkomst (Dice), dezelfde maat die pg_trgm gebruikt. */
export function gelijkenis(a: string, b: string): number {
  const tri = (s: string): Set<string> => {
    const p = `  ${s} `
    const uit = new Set<string>()
    for (let i = 0; i < p.length - 2; i++) uit.add(p.slice(i, i + 3))
    return uit
  }
  const A = tri(a), B = tri(b)
  if (A.size === 0 || B.size === 0) return 0
  let gedeeld = 0
  for (const t of A) if (B.has(t)) gedeeld++
  return (2 * gedeeld) / (A.size + B.size)
}

/**
 * Kiest uit meerdere contactpersonen op hetzelfde adres degene die de mail noemt.
 *
 * Alleen op de achternaam, en alleen bij precies één treffer. Het model levert de
 * naam in allerlei vormen aan — "A. Gasieta", "Arif Gasieta", "dhr. Gasieta" — dus
 * de voornaam of de voorletter vergelijken zegt weinig; de achternaam is wat er
 * altijd staat. Bij twijfel liever niemand: een verkeerde naam op de beoordeling
 * ziet niemand, een leeg veld wel.
 */
function kiesOpNaam<T extends { naam: string }>(treffers: T[], naamUitMail: string | null): T | null {
  const gezocht = normaliseerPersoon(naamUitMail)
  if (!gezocht) return null

  const woorden = gezocht.split(' ').filter(w => w.length >= 3)
  if (!woorden.length) return null

  const passend = treffers.filter(t => {
    const kandidaat = normaliseerPersoon(t.naam)
    return kandidaat ? woorden.some(w => kandidaat.split(' ').includes(w)) : false
  })
  return passend.length === 1 ? passend[0] : null
}

/** Persoonsnaam vergelijkbaar maken: zonder titels, initialen, leestekens en diacrieten. */
export function normaliseerPersoon(naam: string | null): string {
  return (naam ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(dhr|mevr|mw|de heer|mevrouw|drs|ir|ing|mr)\b\.?/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\b[a-z]\b/g, ' ')   // losse initialen zeggen niets
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Zoekt de relatie bij een afzender.
 *
 * `klantNaamUitMail` komt van het taalmodel en is dus een aanwijzing, geen bewijs —
 * vandaar dat die pas op trede 4 en 5 meetelt, en daar met een lagere score.
 */
export async function herkenAfzender(opts: {
  vanAdres: string | null
  klantNaamUitMail: string | null
  /**
   * De naam van de contactpersoon zoals het model hem in de mail las. Wordt alleen
   * gebruikt om te kiezen tussen mensen die hetzelfde postbusadres delen — nooit om
   * iemand te vinden die er anders niet bij zou zijn gekomen.
   */
  contactpersoonNaamUitMail?: string | null
  /** true als de mail door een eigen medewerker is doorgestuurd. */
  doorgestuurd?: boolean
  /**
   * Onze eigen bedrijfsdomeinen. Worden op trede 3 overgeslagen: een adres op ons
   * eigen domein zegt iets over ons, niet over de klant.
   */
  eigenDomeinen?: Set<string>
}): Promise<AfzenderTreffer> {
  const supabase = createAdminClient()
  const adres = (opts.vanAdres ?? '').trim().toLowerCase()
  const domein = domeinVan(adres)

  // Doorgestuurde mail nooit volautomatisch: het bewijs is dan tweedehands.
  const plafond = opts.doorgestuurd ? 0.8 : 1

  // ── 1. Alias uit eerdere handmatige koppelingen ────────────────────────────
  if (adres) {
    const patronen = domein ? [adres, '@' + domein] : [adres]
    const { data } = await supabase
      .from('mailintake_aliassen')
      .select('id, patroon, relatie_id, contactpersoon_id, relatie:relaties(id, naam), contactpersoon:contactpersonen(id, voornaam, achternaam)')
      .eq('soort', 'koppel')
      .in('patroon', patronen)
      .limit(5)

    // Een adres-alias is specifieker dan een domein-alias en wint dus.
    const rij = (data ?? []).sort((a: any, b: any) => (a.patroon.startsWith('@') ? 1 : 0) - (b.patroon.startsWith('@') ? 1 : 0))[0]
    if (rij?.relatie) {
      await supabase.from('mailintake_aliassen').update({ laatst_gebruikt_op: new Date().toISOString() }).eq('id', rij.id)
      return {
        relatieId: rij.relatie.id,
        relatieNaam: rij.relatie.naam,
        contactpersoonId: rij.contactpersoon?.id ?? null,
        contactpersoonNaam: rij.contactpersoon
          ? [rij.contactpersoon.voornaam, rij.contactpersoon.achternaam].filter(Boolean).join(' ')
          : null,
        score: Math.min(1, plafond),
        via: 'alias',
        kandidaten: [{ id: rij.relatie.id, naam: rij.relatie.naam }],
        toelichting: `Dit adres is eerder handmatig aan ${rij.relatie.naam} gekoppeld.`,
      }
    }
  }

  // ── 2. Exact e-mailadres van een contactpersoon ────────────────────────────
  // Niet alleen het primaire adres: iemand kan vanaf zijn tweede adres mailen, en dan hoort
  // het bericht nog steeds bij dezelfde persoon. `contactpersoon_emails` bevat beide.
  if (adres) {
    const { data: viaLijst } = await supabase
      .from('contactpersoon_emails')
      .select('contactpersoon_id')
      .ilike('email', adres)
      .limit(10)
    const idsViaLijst = [...new Set((viaLijst ?? []).map((r: { contactpersoon_id: string }) => r.contactpersoon_id))]

    const velden = 'id, voornaam, achternaam, email, contactpersoon_organisaties(is_primair, organisatie:relaties(id, naam, actief))'
    const { data: viaPrimair } = await supabase
      .from('contactpersonen').select(velden).ilike('email', adres).eq('actief', true).limit(10)
    const { data: viaExtra } = idsViaLijst.length
      ? await supabase.from('contactpersonen').select(velden).in('id', idsViaLijst).eq('actief', true).limit(10)
      : { data: [] }

    // Het primaire adres eerst: dat is de sterkste treffer als beide wegen iets opleveren.
    const gezien = new Set<string>()
    const data: any[] = []
    for (const cp of [...(viaPrimair ?? []), ...(viaExtra ?? [])]) {
      if (gezien.has(cp.id)) continue
      gezien.add(cp.id)
      data.push(cp)
    }

    // Iedereen die op dit adres uitkomt én bij een actieve relatie hoort.
    const treffers = data
      .map(cp => {
        const koppels = (cp.contactpersoon_organisaties ?? []) as any[]
        const primair = koppels.find(k => k.is_primair && k.organisatie?.actief)
          ?? koppels.find(k => k.organisatie?.actief)
        return primair?.organisatie
          ? { cp, org: primair.organisatie, naam: [cp.voornaam, cp.achternaam].filter(Boolean).join(' ') }
          : null
      })
      .filter((t): t is { cp: any; org: any; naam: string } => t !== null)

    if (treffers.length) {
      // ── Eén adres, meerdere mensen ────────────────────────────────────────
      // Beheerkantoren mailen vanaf een postbusadres: denhaag@vve-nederland.nl
      // hangt in EVA aan drie contactpersonen. De eerste versie pakte gewoon de
      // eerste rij uit de query, en dan staat er een naam op de beoordeling die
      // niets met deze mail te maken heeft -- bij dossier 20261.00282 "S. van
      // Riel", terwijl de brief van Arif Gasieta was.
      //
      // Zo'n adres bewijst het bedríjf, niet de persoon. Dus: de naam uit de mail
      // gebruiken om te kiezen, en lukt dat niet, dan de relatie wél teruggeven en
      // de persoon leeg laten. Een leeg veld laat de behandelaar kiezen; een fout
      // ingevuld veld laat hem niets merken.
      const uniekeRelaties = new Set(treffers.map(t => t.org.id))
      const gekozen = treffers.length === 1
        ? treffers[0]
        : kiesOpNaam(treffers, opts.contactpersoonNaamUitMail ?? null)

      if (gekozen) {
        return {
          relatieId: gekozen.org.id,
          relatieNaam: gekozen.org.naam,
          contactpersoonId: gekozen.cp.id,
          contactpersoonNaam: gekozen.naam || null,
          score: Math.min(1, plafond),
          via: 'email_contactpersoon',
          kandidaten: [{ id: gekozen.org.id, naam: gekozen.org.naam }],
          toelichting: treffers.length === 1
            ? `Herkend via het e-mailadres van ${gekozen.naam || 'een contactpersoon'} bij ${gekozen.org.naam}.`
            : `${adres} is een gedeeld postbusadres; de naam in de mail wijst naar ${gekozen.naam}.`,
        }
      }

      // Geen naam die uitsluitsel geeft. Alleen doorgaan als alle kandidaten bij
      // dezelfde relatie horen -- anders weten we ook het bedrijf niet.
      if (uniekeRelaties.size === 1) {
        const org = treffers[0].org
        return {
          relatieId: org.id,
          relatieNaam: org.naam,
          contactpersoonId: null,
          contactpersoonNaam: null,
          score: Math.min(1, plafond),
          via: 'email_contactpersoon',
          kandidaten: [{ id: org.id, naam: org.naam }],
          toelichting:
            `${adres} is een gedeeld postbusadres van ${org.naam}; er hangen ${treffers.length} `
            + 'contactpersonen aan en de mail noemt niet duidelijk wie. Kies zelf de juiste persoon.',
        }
      }
    }
  }

  // ── 2b. Het adres staat op de relatie zelf ─────────────────────────────────
  if (adres) {
    const { data } = await supabase
      .from('relaties')
      .select('id, naam')
      .ilike('email', adres)
      .eq('actief', true)
      .limit(5)
    const treffers = data ?? []
    if (treffers.length === 1) {
      const relatie = treffers[0]
      return {
        relatieId: relatie.id, relatieNaam: relatie.naam,
        contactpersoonId: null, contactpersoonNaam: null,
        score: Math.min(1, plafond), via: 'email_contactpersoon',
        kandidaten: [{ id: relatie.id, naam: relatie.naam }],
        toelichting: `Dit is het algemene e-mailadres van ${relatie.naam}.`,
      }
    }
  }

  // ── 3. Domein hoort bij precies één relatie ───────────────────────────────
  //
  // Ons éigen domein hoort hier net zo goed buiten als gmail.com. Er staat bij een
  // klant soms een eigen medewerker als contactpersoon — Faried Madjoe met
  // faried@everts.chat bij FASA — en dan levert deze trede die relatie op voor élke
  // mail die van een collega lijkt te komen. Zo werd een particuliere dakaanvraag
  // voor Burgemeester Meineszlaan 62 aan FASA toegeschreven.
  //
  // Dat die relatie een verdwaalde contactpersoon heeft is een datafout, maar de
  // ladder hoort daar sowieso niet op te matchen: een adres op ons eigen domein
  // zegt iets over ons, niet over de klant.
  const eigenDomein = domein != null && (opts.eigenDomeinen?.has(domein) ?? false)
  if (domein && !isVrijMaildomein(domein) && !eigenDomein) {
    const { data } = await supabase
      .from('contactpersonen')
      .select('id, contactpersoon_organisaties(is_primair, organisatie:relaties(id, naam, actief))')
      .ilike('email', `%@${domein}`)
      .eq('actief', true)
      .limit(200)

    const perRelatie = new Map<string, string>()
    for (const cp of data ?? []) {
      for (const k of (cp.contactpersoon_organisaties ?? []) as any[]) {
        if (k.organisatie?.actief) perRelatie.set(k.organisatie.id, k.organisatie.naam)
      }
    }
    const kandidaten = [...perRelatie].map(([id, naam]) => ({ id, naam }))

    if (kandidaten.length === 1) {
      return {
        relatieId: kandidaten[0].id, relatieNaam: kandidaten[0].naam,
        contactpersoonId: null, contactpersoonNaam: null,
        score: Math.min(0.85, plafond), via: 'email_domein', kandidaten,
        toelichting: `Het domein ${domein} hoort bij ${kandidaten[0].naam}.`,
      }
    }
    if (kandidaten.length > 1) {
      // Meerdere klanten op één domein (beheerder, koepel). Nooit automatisch:
      // welke van de zes VvE's het is, staat niet in het adres.
      return {
        relatieId: null, relatieNaam: null, contactpersoonId: null, contactpersoonNaam: null,
        score: 0.4, via: 'email_domein', kandidaten,
        toelichting: `Het domein ${domein} hoort bij ${kandidaten.length} verschillende relaties — kies de juiste.`,
      }
    }
  }

  // ── 4 en 5. Klantnaam uit de mail ─────────────────────────────────────────
  const genoemd = (opts.klantNaamUitMail ?? '').trim()
  if (genoemd.length >= 3) {
    const genormaliseerd = normaliseerNaam(genoemd)
    // Begrens de kandidatenlijst op het langste woord uit de naam; zonder zo'n
    // filter is dit precies het soort query dat stil tegen de 1000-rijengrens loopt.
    const kern = genormaliseerd.split(' ').sort((a, b) => b.length - a.length)[0] ?? genormaliseerd
    const { data } = await supabase
      .from('relaties')
      .select('id, naam')
      .eq('actief', true)
      .ilike('naam', `%${kern}%`)
      .limit(50)

    const scored = (data ?? [])
      .map((r: any) => ({ id: r.id, naam: r.naam, s: gelijkenis(genormaliseerd, normaliseerNaam(r.naam)) }))
      .sort((a: any, b: any) => b.s - a.s)

    const exact = scored.filter((r: any) => normaliseerNaam(r.naam) === genormaliseerd)
    if (exact.length === 1) {
      return {
        relatieId: exact[0].id, relatieNaam: exact[0].naam,
        contactpersoonId: null, contactpersoonNaam: null,
        score: Math.min(0.8, plafond), via: 'relatie_naam',
        kandidaten: [{ id: exact[0].id, naam: exact[0].naam }],
        toelichting: `De klantnaam in de mail komt exact overeen met ${exact[0].naam}.`,
      }
    }

    const bijna = scored.filter((r: any) => r.s >= 0.75)
    if (bijna.length === 1) {
      return {
        relatieId: bijna[0].id, relatieNaam: bijna[0].naam,
        contactpersoonId: null, contactpersoonNaam: null,
        score: Math.min(0.6, plafond), via: 'relatie_naam',
        kandidaten: bijna.map((r: any) => ({ id: r.id, naam: r.naam })),
        toelichting: `De klantnaam lijkt op ${bijna[0].naam} — controleer of dat klopt.`,
      }
    }
    if (bijna.length > 1) {
      return {
        ...GEEN,
        score: 0.3, via: 'relatie_naam',
        kandidaten: bijna.slice(0, 8).map((r: any) => ({ id: r.id, naam: r.naam })),
        toelichting: `Meerdere relaties lijken op "${genoemd}".`,
      }
    }
  }

  return GEEN
}

/**
 * Kandidaat-relaties als hulplijst voor het model. Bewust klein en bewust
 * vrijblijvend: het model mag hieruit een naam herkennen, maar de koppeling
 * gebeurt hierboven.
 */
export async function hulplijstRelaties(vanAdres: string | null, onderwerp: string | null): Promise<string[]> {
  const supabase = createAdminClient()
  const domein = domeinVan(vanAdres)
  const uit = new Set<string>()

  if (domein && !isVrijMaildomein(domein)) {
    const { data } = await supabase
      .from('contactpersonen')
      .select('contactpersoon_organisaties(organisatie:relaties(naam, actief))')
      .ilike('email', `%@${domein}`)
      .eq('actief', true)
      .limit(50)
    for (const cp of data ?? []) {
      for (const k of (cp.contactpersoon_organisaties ?? []) as any[]) {
        if (k.organisatie?.actief) uit.add(k.organisatie.naam)
      }
    }
  }

  // Een enkel kenmerkend woord uit het onderwerp levert vaak de VvE of corporatie op.
  const woorden = (onderwerp ?? '')
    .split(/[^A-Za-zÀ-ÿ0-9]+/)
    .filter(w => w.length >= 5)
    .slice(0, 3)
  for (const w of woorden) {
    if (uit.size >= 10) break
    const { data } = await supabase
      .from('relaties').select('naam').eq('actief', true).ilike('naam', `%${w}%`).limit(5)
    for (const r of data ?? []) uit.add(r.naam)
  }

  return [...uit].slice(0, 10)
}
