'use server'

/**
 * Verkooptermijnen klaarzetten voor facturatie.
 *
 * Je vinkt op de Verkoop-tab de termijnen aan die gefactureerd mogen worden; EVA maakt daar één
 * conceptfactuur van in Bouw7. De administratie ziet die als concept staan — dat is precies het
 * signaal dat hij verzonden mag worden — controleert hem en verstuurt. Bouw7 kent het
 * factuurnummer pas bij verzenden toe, dus de fiscale nummering blijft daar.
 *
 * **Er is bewust geen EVA-tabel voor "klaargezet".** De waarheid staat in Bouw7 zelf: zodra een
 * termijn op een factuur staat, draagt hij een `invoiceLine`. Een eigen kopie zou daarvan kunnen
 * gaan afwijken zodra de administratie in Bouw7 iets aanpast, en dan zou EVA een termijn kunnen
 * voorstellen die daar al gefactureerd is. De idempotentie loopt via een marker in de interne
 * notitie van de factuur (zie `lib/bouw7/verkoopfactuur.ts`).
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { createHash } from 'node:crypto'
import { getDossierVerkoop, bouw7VoorDossier } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { vereisRecht } from '@/lib/auth/rechten'
import { maakConceptVerkoopfactuur } from '@/lib/bouw7/verkoopfactuur'
import { schrijfBouw7Termijnstaat, leesBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'
import type { Bouw7ListResponse, Bouw7ProjectInvoiceTerm } from '@/lib/bouw7/client'

export type KlaarzetResultaat =
  | { ok: true; invoiceId: number; aantal: number; totaalExclBtw: number }
  | { ok: false; error: string; invoiceId?: number }

/**
 * Deterministische sleutel voor deze selectie. Twee keer dezelfde termijnen klaarzetten levert
 * dezelfde sleutel op, zodat de tweede poging de al bestaande factuur terugvindt in plaats van een
 * duplicaat te maken — óók als de eerste poging in een time-out verdween.
 */
function selectieSleutel(dossierId: string, termIds: number[]): string {
  const basis = `${dossierId}|${[...termIds].sort((a, b) => a - b).join(',')}`
  return createHash('sha1').update(basis).digest('hex').slice(0, 16)
}

/**
 * Zet de geselecteerde termijnen als één conceptfactuur klaar in Bouw7.
 *
 * De selectie wordt vlak vóór de write nog één keer tegen de live Bouw7-stand gehouden. Tussen het
 * renderen van het scherm en de klik kan de administratie een termijn al gefactureerd hebben; dan
 * mag EVA hem niet nóg eens meenemen. Dezelfde les als bij de inkoopcontracten, waar EVA regels
 * bleef voorstellen die in Bouw7 al onder een contract hingen.
 */
export async function zetTermijnenKlaar(
  dossierId: string,
  bouw7TermIds: number[],
): Promise<KlaarzetResultaat> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  if (bouw7TermIds.length === 0) return { ok: false, error: 'Selecteer eerst een of meer termijnen.' }

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }
  const { client, bouw7Id } = ctx

  // Live stand ophalen. Filteren op statement.id, want statement.project.id is niet HQL-mapped.
  let live: Bouw7ProjectInvoiceTerm[]
  try {
    const stmts = await client.get<Bouw7ListResponse<{ id: number }>>(
      '/list/project-invoice-term-statements', { q: `project.id = ${bouw7Id} LIMIT 200` },
    )
    live = []
    for (const s of stmts.items ?? []) {
      const res = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
        '/list/project-invoice-terms', { q: `statement.id = ${s.id} LIMIT 500` },
      )
      live.push(...(res.items ?? []))
    }
  } catch (e) {
    return {
      ok: false,
      error: `De termijnen zijn nu niet op te halen uit Bouw7: ${e instanceof Error ? e.message : 'onbekende fout'}. `
        + 'Er is niets klaargezet.',
    }
  }

  const perId = new Map(live.map(t => [t.id, t]))
  const gekozen: Bouw7ProjectInvoiceTerm[] = []
  const alGefactureerd: string[] = []
  for (const id of bouw7TermIds) {
    const t = perId.get(id)
    if (!t) return { ok: false, error: `Termijn ${id} bestaat niet meer in Bouw7. Ververs het scherm.` }
    if (t.invoiceLine != null) { alGefactureerd.push(t.description ?? String(id)); continue }
    gekozen.push(t)
  }
  if (alGefactureerd.length > 0) {
    return {
      ok: false,
      error: `Deze termijn${alGefactureerd.length > 1 ? 'en staan' : ' staat'} in Bouw7 al op een factuur: `
        + `${alGefactureerd.join(', ')}. Ververs het scherm en probeer opnieuw.`,
    }
  }
  if (gekozen.length === 0) return { ok: false, error: 'Er is niets over om klaar te zetten.' }

  const zonderTarief = gekozen.filter(t => t.vatTariff?.id == null || !Number.isFinite(Number(t.vatTariff.id)))
  if (zonderTarief.length > 0) {
    return {
      ok: false,
      error: `Termijn "${zonderTarief[0].description ?? zonderTarief[0].id}" heeft geen btw-tarief in Bouw7. `
        + 'Vul dat daar eerst in.',
    }
  }

  // Eén regel per termijn — precies zoals Bouw7 het zelf doet. Zo blijft per termijn traceerbaar
  // welk bedrag erop staat, en is achteraf per termijn te controleren of de koppeling is gelegd.
  const regels = gekozen.map(t => ({
    omschrijving: (t.description ?? '').trim() || `Termijn ${t.id}`,
    aantal: 1,
    stukprijs: Number(t.subtotal ?? 0),
    vatTariffId: Number(t.vatTariff!.id),
    projectInvoiceTermIds: [t.id],
  }))

  const res = await maakConceptVerkoopfactuur({
    projectId: Number(bouw7Id),
    regels,
    idempotentieSleutel: selectieSleutel(dossierId, gekozen.map(t => t.id)),
  })
  if (!res.ok) return res

  // Acceptatietest aan de termijnkant: staan de termijnen nu écht aan deze factuur? Zonder deze
  // controle zou er een factuur in Bouw7 kunnen staan die nergens aan hangt, en dat merkt niemand.
  const nietGekoppeld: string[] = []
  try {
    for (const t of gekozen) {
      const na = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
        '/list/project-invoice-terms', { q: `statement.id = ${t.statement?.id} LIMIT 500` },
      )
      const ververst = (na.items ?? []).find(x => x.id === t.id)
      if (ververst?.invoiceLine?.invoiceId !== res.invoiceId) {
        nietGekoppeld.push(ververst?.description ?? String(t.id))
      }
    }
  } catch {
    // Niet kunnen controleren is geen bewijs van falen; de factuur bestaat en dat melden we.
  }

  revalidatePath(`/opdrachten/${dossierId}/verkoop`)
  revalidatePath(`/servicedesk/${dossierId}/financieel`)

  if (nietGekoppeld.length > 0) {
    return {
      ok: false,
      invoiceId: res.invoiceId,
      error: `De conceptfactuur staat klaar in Bouw7 (${res.invoiceId}), maar deze termijn(en) zijn er niet `
        + `aan gekoppeld: ${nietGekoppeld.join(', ')}. Controleer de factuur in Bouw7.`,
    }
  }

  return { ok: true, invoiceId: res.invoiceId, aantal: gekozen.length, totaalExclBtw: res.totaalExclBtw }
}

/**
 * Vergelijkt het termijnschema in Bouw7 met de betalingsconditie uit de EVA-offerte, zodat een
 * afwijking zichtbaar wordt in plaats van stil te blijven.
 *
 * De offerte kent haar termijnen via `quotes.betalingsconditie_id` → `betalingscondities.termijnen`
 * (`[{ omschrijving, percentage }]`). Dat is puur documenttekst; er is geen garantie dat wat in
 * Bouw7 staat daarmee overeenkomt. Juist die stille afwijking is duur: dan factureer je een ander
 * schema dan de klant heeft geaccepteerd.
 */
export type TermijnAfwijking = {
  /** Percentages uit de offerte-betalingsconditie, in volgorde. */
  offerte: { omschrijving: string; percentage: number }[]
  /** Percentages zoals ze nu in Bouw7 staan. */
  bouw7: { omschrijving: string; percentage: number | null }[]
  /** Naam van de betalingsconditie op de offerte. */
  conditieNaam: string | null
  /** Gezet zodra offerte en Bouw7 niet op elkaar aansluiten. */
  afwijking: string | null
}

export async function getTermijnAfwijking(dossierId: string): Promise<TermijnAfwijking | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: dossier } = await supabase
    .from('dossiers').select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  if (!dossier?.everts_calc_project_id) return null

  const { data: quote } = await supabase
    .from('quotes')
    .select('betalingsconditie_id')
    .eq('project_id', dossier.everts_calc_project_id)
    .is('meerwerk_regel_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!quote?.betalingsconditie_id) return null

  const { data: conditie } = await supabase
    .from('betalingscondities').select('naam, termijnen').eq('id', quote.betalingsconditie_id).maybeSingle()
  const ruw = Array.isArray(conditie?.termijnen) ? conditie.termijnen : []
  const offerte = ruw
    .map((t: any) => ({ omschrijving: String(t?.omschrijving ?? ''), percentage: Number(t?.percentage ?? 0) }))
    .filter((t: { percentage: number }) => Number.isFinite(t.percentage))
  if (offerte.length === 0) return null

  const verkoop = await getDossierVerkoop(dossierId)
  if (!verkoop.termijnenBeschikbaar) return null
  const bouw7 = verkoop.termijnen.map(t => ({ omschrijving: t.omschrijving ?? '', percentage: t.percentage }))

  let afwijking: string | null = null
  if (bouw7.length === 0) {
    afwijking = `De offerte gaat uit van ${offerte.length} termijnen (${conditie?.naam ?? 'betalingsconditie'}), `
      + 'maar in Bouw7 staat nog geen termijnstaat.'
  } else if (bouw7.length !== offerte.length) {
    afwijking = `De offerte gaat uit van ${offerte.length} termijnen, in Bouw7 staan er ${bouw7.length}.`
  } else {
    const verschillend = offerte.findIndex((o: { percentage: number }, i: number) =>
      bouw7[i].percentage != null && Math.abs(bouw7[i].percentage! - o.percentage) > 0.01)
    if (verschillend >= 0) {
      afwijking = `Termijn ${verschillend + 1} is in de offerte ${offerte[verschillend].percentage}% `
        + `en in Bouw7 ${bouw7[verschillend].percentage}%.`
    }
  }

  return { offerte, bouw7, conditieNaam: conditie?.naam ?? null, afwijking }
}


/**
 * Maakt het termijnschema uit de offerte aan in Bouw7.
 *
 * De percentages komen uit de betalingsconditie op de hoofdofferte; de bedragen worden op de
 * actuele aanneemsom gerekend. Het laatste termijn krijgt het afrondingsverschil, zodat de som
 * exact op de aanneemsom uitkomt — anders blijft er een cent over die niemand kan factureren.
 *
 * Staat er al een termijnstaat, dan wordt die hergebruikt; termijnen waar al een factuur aan hangt
 * blijven ongemoeid en worden teruggemeld.
 */
export async function maakTermijnschemaInBouw7(
  dossierId: string,
  btwTariefBouw7Id: number,
): Promise<
  | { ok: true; aangemaakt: number; bijgewerkt: number; overgeslagen: string[]; onbekendInEva: string[] }
  | { ok: false; error: string }
> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }

  const afwijking = await getTermijnAfwijking(dossierId)
  if (!afwijking || afwijking.offerte.length === 0) {
    return {
      ok: false,
      error: 'Er is geen betalingsconditie met termijnen op de offerte van dit dossier. '
        + 'Kies er een in de calculatie, of maak de termijnen in Bouw7 zelf aan.',
    }
  }

  const verkoop = await getDossierVerkoop(dossierId)
  const aanneemsom = verkoop.totalen.aanneemsom
  if (!(aanneemsom > 0)) {
    return { ok: false, error: 'Dit dossier heeft nog geen aanneemsom; zonder bedrag zijn er geen termijnen te berekenen.' }
  }

  const somPct = afwijking.offerte.reduce((s, t) => s + t.percentage, 0)
  if (Math.abs(somPct - 100) > 0.01) {
    return {
      ok: false,
      error: `De termijnen van de betalingsconditie tellen op tot ${somPct}% in plaats van 100%. `
        + 'Corrigeer de betalingsconditie voordat je hem naar Bouw7 schrijft.',
    }
  }

  // Bestaande termijnen op volgorde matchen, zodat een tweede keer schrijven bijwerkt in plaats
  // van dupliceert.
  let bestaand: Awaited<ReturnType<typeof leesBouw7Termijnstaat>>
  try {
    bestaand = await leesBouw7Termijnstaat(Number(ctx.bouw7Id))
  } catch (e) {
    return { ok: false, error: `De huidige termijnstaat is niet op te halen: ${e instanceof Error ? e.message : 'onbekende fout'}.` }
  }

  const centen = Math.round(aanneemsom * 100)
  let verdeeld = 0
  const termijnen = afwijking.offerte.map((t, i) => {
    const laatste = i === afwijking.offerte.length - 1
    const eigenCenten = laatste ? centen - verdeeld : Math.round(centen * t.percentage / 100)
    verdeeld += eigenCenten
    return {
      bouw7TermId: bestaand.termijnen[i]?.id ?? null,
      omschrijving: t.omschrijving || `Termijn ${i + 1}`,
      percentage: t.percentage,
      bedragExclBtw: eigenCenten / 100,
      vatTariffId: btwTariefBouw7Id,
    }
  })

  // De debiteur: uit de bestaande staat, anders uit het skelet dat Bouw7 voor een nieuwe factuur
  // teruggeeft — dat draagt het project-contact.
  let contactId: number | null = null
  try {
    const skelet = await ctx.client.get<{ contact?: { id?: number } }>(`/project/${ctx.bouw7Id}/invoice/new`)
    contactId = skelet?.contact?.id ?? null
  } catch { /* hieronder afgevangen */ }
  if (contactId == null) {
    return { ok: false, error: 'Dit Bouw7-project heeft geen debiteur; koppel daar eerst een relatie.' }
  }

  const res = await schrijfBouw7Termijnstaat({
    projectId: Number(ctx.bouw7Id),
    contactId,
    aanneemsom,
    termijnen,
  })
  if (!res.ok) return res

  revalidatePath(`/opdrachten/${dossierId}/verkoop`)
  return {
    ok: true,
    aangemaakt: res.aangemaakt,
    bijgewerkt: res.bijgewerkt,
    overgeslagen: res.overgeslagen,
    onbekendInEva: res.onbekendInEva,
  }
}
