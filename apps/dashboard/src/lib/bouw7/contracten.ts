/**
 * Inkooporders en onderaannemerscontracten schrijven naar Bouw7.
 *
 *  - inkooporder  → `POST /contracts/purchase-order`
 *  - OA-contract  → `POST /contracts/subcontractor`
 *
 * Beide zijn upserts: `id` in de body = update, weggelaten = create.
 *
 * ── Wat de schrijftest van juli 2026 heeft uitgewezen (project 3869371, weer opgeruimd) ──
 *
 * 1. **Termijnen mogen inline mee.** `contractTerms[]` in dezelfde POST als het contract werkt;
 *    er is geen aparte call per termijn nodig. (`/contracts/…/contract-term` bestaat wel, maar
 *    is alleen nodig om losse termijnen te muteren.)
 * 2. **`contractOrderLines: [{ id }]` koppelt een BESTAANDE bestelregel** aan de termijn — het
 *    maakt er geen nieuwe. Dat is de kern van dit ontwerp: de werkbegroting-push
 *    (`stuurWerkbegrotingBestelregelsBouw7`) blijft de enige bron van bestelregels, en het
 *    contract hangt ze alleen onder zich. Zou het contract eigen regels aanmaken, dan stonden
 *    dezelfde kosten twee keer in de "verwachte kosten" per bewakingscode.
 *    Na koppeling krijgt de regel `status: 1` en `subcontractorContract`/`purchaseOrderContract`,
 *    en neemt Bouw7 zelf de leverancier van het contract over op de regel.
 * 3. **DELETE wil meer dan `{ id }`.** Alleen id geeft 400 op `project` en `cost`; stuur de
 *    condensed vorm mee (zie `verwijderBouw7Contract`).
 * 4. **Volgorde bij opruimen:** een bestelregel die aan een termijn hangt kan niet los verwijderd
 *    worden ("cannot be deleted because it is linked to contract term"). Eerst het contract weg.
 *
 * 5. **De leverbon ontstaat door AF TE ROEPEN**, niet door hem los aan te maken. Zie
 *    `roepBouw7ContractAf` onderaan dit bestand — daar staat waarom en hoe.
 *
 * Status-id's worden **live opgehaald** (`GET /contracts/{soort}/statuses`) — nooit gehardcodeerd.
 * Ze zijn per organisatie ingericht en een verkeerde gok zet een contract stilzwijgend op een
 * verkeerde stand (bv. "geleverd" i.p.v. "concept").
 */

import { getBouw7Client } from '@/lib/bouw7/sync'

export type ContractSoort = 'inkooporder' | 'oa_contract'

/** Endpoint-stam per soort. Let op: bij de POST van een losse termijn heet OA `subcontract`. */
const PAD: Record<ContractSoort, string> = {
  inkooporder: '/contracts/purchase-order',
  oa_contract: '/contracts/subcontractor',
}

/**
 * Naam van de "nog niet verstuurd"-status per soort, zoals Bouw7 die teruggeeft.
 * EVA maakt bewust alleen concepten: het versturen naar de leverancier gebeurt in Bouw7.
 */
const CONCEPT_STATUS_NAAM: Record<ContractSoort, string> = {
  inkooporder: 'to_order',
  oa_contract: 'to_send',
}

/**
 * `purchaseType` van een inkooporder (`GET /contracts/purchase-order/cost-types`):
 * 2 = purchase_order · 4 = equipment · 5 = material · 6 = remaining.
 * Materieel-componenten worden ingekocht als 'equipment', de rest als 'material'.
 */
export const PURCHASE_TYPE = { inkooporder: 2, materieel: 4, materiaal: 5, overig: 6 } as const

type Status = { id: number; name: string }

/** Statuslijsten veranderen niet tijdens een request; per proces één keer ophalen volstaat. */
const statusCache = new Map<ContractSoort, Status[]>()

async function getStatussen(soort: ContractSoort): Promise<Status[]> {
  const gecacht = statusCache.get(soort)
  if (gecacht) return gecacht
  const client = await getBouw7Client()
  const lijst = await client.get<Status[]>(`${PAD[soort]}/statuses`)
  const arr = Array.isArray(lijst) ? lijst : []
  statusCache.set(soort, arr)
  return arr
}

/**
 * Id van de concept-status. Gooit als die niet in de lijst staat — liever een duidelijke fout
 * dan een contract dat op een gegokte status belandt.
 */
export async function getConceptStatusId(soort: ContractSoort): Promise<number> {
  const statussen = await getStatussen(soort)
  const naam = CONCEPT_STATUS_NAAM[soort]
  const gevonden = statussen.find(s => s.name === naam)
  if (!gevonden) {
    throw new Error(
      `Bouw7 kent geen "${naam}"-status voor ${soort === 'inkooporder' ? 'inkooporders' : 'OA-contracten'} ` +
      `(gevonden: ${statussen.map(s => s.name).join(', ') || 'niets'}).`,
    )
  }
  return gevonden.id
}

/** Eén regel binnen het contract. Verwijst naar een al bestaande bestelregel in Bouw7. */
export type ContractTermijn = {
  /** Regelnummer zoals de leverancier het ziet ("1", "2", …). */
  nummer: string
  omschrijving: string
  /** Bouw7 toont `unit` + `amount` × `unitPrice`; wij schrijven één post per component. */
  eenheid: string
  aantal: string
  stukprijs: string
  subtotaal: string
  /** Bewakingscode (PSL-id) waarop de kosten landen. */
  pslId?: number
  /**
   * Bestaande contract-order-lines — worden gekoppeld, niet gedupliceerd. Meestal één per termijn;
   * bij een winkelbudget hangen alle onderliggende regels onder één samengevatte termijn.
   */
  bestelregelIds?: number[]
}

export type ContractInvoer = {
  soort: ContractSoort
  projectId: number
  /** Bouw7-contact-id van de leverancier (inkooporder) of onderaannemer (OA-contract). */
  relatieBouw7Id: number
  naam: string
  omschrijving?: string
  /** Totaalbedrag van het contract; Bouw7 rekent dit niet zelf uit de termijnen. */
  bedrag: string
  termijnen: ContractTermijn[]
  /** Bestaand contract bijwerken i.p.v. aanmaken. */
  bouw7ContractId?: number | null
  leverDatum?: string | null
  leverTekst?: string | null
  /** Alleen OA-contracten: verwachte oplevering (`expectedCompletionDate`). */
  opleverDatum?: string | null
  opleverTekst?: string | null
  betaalafspraak?: string | null
  interneNotitie?: string | null
  /** Alleen voor inkooporders; default 5 (material). */
  purchaseType?: number
  /** Alleen voor inkooporders — Bouw7 toont dit op de orderbon. */
  afleveradres?: string | null
}

export type ContractResultaat =
  | { ok: true; contractId: number; nummer: string | null }
  | { ok: false; error: string }

function termijnBody(t: ContractTermijn, index: number) {
  return {
    number: t.nummer,
    description: t.omschrijving,
    sortIndex: index,
    unit: t.eenheid,
    amount: t.aantal,
    unitPrice: t.stukprijs,
    subTotal: t.subtotaal,
    amountOnly: false,
    createDeliveryTicket: false,
    ...(t.pslId != null ? { projectSecurityLink: { id: t.pslId } } : {}),
    ...(t.bestelregelIds?.length ? { contractOrderLines: t.bestelregelIds.map(id => ({ id })) } : {}),
  }
}

/**
 * Maak (of werk bij) een inkooporder / OA-contract in Bouw7, inclusief zijn termijnen.
 * Altijd in **concept**: EVA verstuurt nooit zelf naar een leverancier.
 */
export async function schrijfBouw7Contract(invoer: ContractInvoer): Promise<ContractResultaat> {
  try {
    const client = await getBouw7Client()
    const statusId = await getConceptStatusId(invoer.soort)
    const isOa = invoer.soort === 'oa_contract'

    const body: Record<string, unknown> = {
      ...(invoer.bouw7ContractId != null ? { id: invoer.bouw7ContractId } : {}),
      project: { id: invoer.projectId },
      [isOa ? 'subcontractor' : 'supplier']: { id: invoer.relatieBouw7Id },
      status: statusId,
      type: 0, // 0 = vaste prijs (OA ook: 1 = regie, 2 = uitbesteed)
      name: invoer.naam,
      description: invoer.omschrijving ?? '',
      paymentAgreement: invoer.betaalafspraak ?? '',
      internalNote: invoer.interneNotitie ?? null,
      cost: invoer.bedrag,
      language: 'nl-NL',
      createDeliveryTicket: false,
      mailSent: false,
      contractTerms: invoer.termijnen.map(termijnBody),
    }

    if (isOa) {
      // Bouw7 heeft óf een datum óf een vrije tekst ("week 34") — beide mag ook.
      if (invoer.leverDatum) body.startDate = invoer.leverDatum
      if (invoer.leverTekst) body.startDateText = invoer.leverTekst
      // Een OA-contract kent naast de start ook een verwachte oplevering; een inkooporder niet.
      if (invoer.opleverDatum) body.expectedCompletionDate = invoer.opleverDatum
      if (invoer.opleverTekst) body.expectedCompletionDateText = invoer.opleverTekst
    } else {
      body.purchaseType = invoer.purchaseType ?? PURCHASE_TYPE.materiaal
      body.deliveryAddress = invoer.afleveradres ?? ''
      if (invoer.leverDatum) body.deliveryDate = invoer.leverDatum
      if (invoer.leverTekst) body.deliveryDateText = invoer.leverTekst
    }

    const res = await client.post<{ id?: number; number?: string | null }>(PAD[invoer.soort], body)
    if (res?.id == null) return { ok: false, error: 'Bouw7 gaf geen contract-id terug.' }
    return { ok: true, contractId: res.id, nummer: res.number ?? null }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    if (/\b40[13]\b/.test(msg)) {
      return { ok: false, error: `Bouw7 weigerde de schrijfactie (${msg}) — controleer de schrijfrechten van de API-key.` }
    }
    return { ok: false, error: msg }
  }
}

// ─── Afroepen: de leverbon laten ontstaan ────────────────────────────────────
//
// Bouw7 heeft een leverbon nodig om een inkoopfactuur aan een order/contract te kunnen
// matchen. Die bon is NIET los aan te maken met een contractkoppeling — `DeliveryTicket.contract`
// is read-only en zowel `createDeliveryTicket`, een statuswissel als `linkedDeliveryTicket`
// worden genegeerd (4 routes getest, zie WRITE-ENDPOINTS.md §2d).
//
// Wat wél werkt is het **afroepen** van de contracttermijnen. Bouw7 maakt de bon dan zelf en
// legt daarbij alles goed: contractkoppeling, bonnummer `<contractnummer>B001`, bewakingscode
// en `purchaseType`. Endpoint komt uit een UI-capture en staat niet in de Swagger-spec.

/** Status die het afroepen mogelijk maakt: OA `waiting_for_approval`, inkooporder `ordered`. */
const AFROEP_STATUS_NAAM: Record<ContractSoort, string> = {
  inkooporder: 'ordered',
  oa_contract: 'waiting_for_approval',
}

/**
 * Id van de status waarin afroepen is toegestaan. Een contract in concept weigert Bouw7 met
 * `must have status "…" in order to approve contract terms`.
 */
export async function getAfroepStatusId(soort: ContractSoort): Promise<number> {
  const statussen = await getStatussen(soort)
  const naam = AFROEP_STATUS_NAAM[soort]
  const gevonden = statussen.find(s => s.name === naam)
  if (!gevonden) {
    throw new Error(`Bouw7 kent geen "${naam}"-status (gevonden: ${statussen.map(s => s.name).join(', ') || 'niets'}).`)
  }
  return gevonden.id
}

/** Zet de contractstatus. Nodig omdat afroepen niet mag op een concept. */
export async function zetBouw7ContractStatus(
  soort: ContractSoort,
  contractId: number,
  statusId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = await getBouw7Client()
    await client.put(`${PAD[soort]}/${contractId}/update-status/${statusId}`)
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

export type AfroepResultaat =
  | { ok: true; bonId: number | null; bonnummer: string | null; bonAantal: number }
  | { ok: false; error: string }

/** Termijn zoals Bouw7 hem teruggeeft; gaat integraal terug in de afroep-body. */
type Bouw7ContractTermijn = Record<string, unknown> & {
  id?: number
  amount?: string
  subTotal?: string
}

/**
 * Roep de termijnen van een contract volledig af, zodat Bouw7 de leverbon(nen) aanmaakt.
 *
 * ⚠️ **Per termijn een aparte call — nooit alle termijnen in één keer.** Geverifieerd op Bouw7
 * (aug 2026, wegwerpcontract): één `approve-contract-terms` met álle termijnen levert **één
 * gebundelde leverbon** voor het hele contractbedrag; een aparte call per termijn levert **één
 * leverbon per contractregel** (`…B001`, `…B002`, …). Dat laatste is wat je wilt: een inkoopfactuur
 * voor één regel boekt dan schoon af op díé regel-bon. Met één gebundelde bon matcht een deelfactuur
 * tegen het volle contractbedrag en klopt de afboeking niet — Bouw7 ziet het contract dan als
 * volledig ontvangen.
 *
 * `items` bevat het **complete** termijn-object uit `GET /contracts/{soort}/{id}` (de UI stuurt het
 * ook onverkort terug), met `partiallyAmountReceived`/`partiallyCostReceived` op het volledige
 * regelbedrag — dát bepaalt het bonbedrag.
 *
 * Bewust uit: `createPdf` (geen afroepbon-PDF nodig) en alle recipients — een gevulde `recipient`
 * laat Bouw7 de leverancier mailen, en EVA verstuurt de order zelf via Outlook.
 * `signatureImage` is optioneel gebleken; alleen `signee` volstaat.
 */
export async function roepBouw7ContractAf(
  soort: ContractSoort,
  contractId: number,
  signee: string,
): Promise<AfroepResultaat> {
  try {
    const client = await getBouw7Client()

    const detail = await client.get<{ number?: string | null; contractTerms?: Bouw7ContractTermijn[] }>(
      `${PAD[soort]}/${contractId}`,
    )
    const termijnen = detail.contractTerms ?? []
    if (termijnen.length === 0) return { ok: false, error: 'Contract heeft geen termijnen om af te roepen.' }

    // Al afgeroepen termijnen (approved) overslaan, zodat een herstelpad geen duplicaat-bonnen maakt.
    const nogAfTeRoepen = termijnen.filter(t => (t as { approved?: boolean }).approved !== true)
    for (const t of nogAfTeRoepen) {
      await client.post(`${PAD[soort]}/approve-contract-terms`, {
        items: [{ ...t, partiallyAmountReceived: t.amount ?? null, partiallyCostReceived: t.subTotal ?? null }],
        createDeliveryTickets: true,
        createPdf: false,
        signee,
        comments: '',
        recipient: null,
        ccRecipients: null,
        bccRecipients: null,
      })
    }

    // De bonnen komen niet in de response (204). Teruglezen levert ze via de termijnen.
    const na = await client.get<{ contractTerms?: { deliveryTickets?: { id?: number; ticketNumber?: string }[] }[] }>(
      `${PAD[soort]}/${contractId}`,
    )
    const bonnen = (na.contractTerms ?? []).flatMap(t => t.deliveryTickets ?? [])
    const eerste = bonnen[0]
    return { ok: true, bonId: eerste?.id ?? null, bonnummer: eerste?.ticketNumber ?? null, bonAantal: bonnen.length }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

export type VerwijderResultaat = { ok: true } | { ok: false; error: string }

/**
 * Verwijder een leverbon. De DELETE wil de condensed vorm, niet alleen `{ id }`.
 * Kan alleen zolang er geen inkoopfactuur op zit (`processed`/`canDelete` zijn daarvoor de
 * indicatoren — perfect gecorreleerd in 77 gemeten bonnen).
 */
export async function verwijderBouw7Leverbon(
  bonId: number,
  context: { bonnummer: string; datum: string },
): Promise<VerwijderResultaat> {
  try {
    const client = await getBouw7Client()
    await client.del('/project/delivery-ticket', {
      id: bonId,
      ticketNumber: context.bonnummer,
      ticketDate: context.datum,
      processed: false,
    })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

/**
 * Verwijder **alle** leverbonnen van een contract. Nodig omdat het afroepen per regel gebeurt en
 * er dus meerdere bonnen (`…B001`, `…B002`, …) kunnen hangen. Weigert zodra er op één bon een
 * inkoopfactuur zit (`processed`) — dan moet het in Bouw7 worden afgehandeld.
 */
export async function verwijderBouw7ContractLeverbonnen(
  soort: ContractSoort,
  contractId: number,
): Promise<VerwijderResultaat> {
  try {
    const client = await getBouw7Client()
    const detail = await client.get<{
      contractTerms?: { deliveryTickets?: { id?: number; ticketNumber?: string; ticketDate?: string; processed?: boolean }[] }[]
    }>(`${PAD[soort]}/${contractId}`)
    const bonnen = (detail.contractTerms ?? []).flatMap(t => t.deliveryTickets ?? [])
    const geboekt = bonnen.find(b => b.processed)
    if (geboekt) {
      return { ok: false, error: `Op leverbon ${geboekt.ticketNumber} zit al een inkoopfactuur — handel dit in Bouw7 af.` }
    }
    for (const b of bonnen) {
      if (b.id == null) continue
      await client.del('/project/delivery-ticket', {
        id: b.id,
        ticketNumber: b.ticketNumber ?? '',
        ticketDate: (b.ticketDate ?? new Date().toISOString()).slice(0, 10),
        processed: false,
      })
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

/**
 * Verwijder een contract. De DELETE valideert een condensed contract, niet alleen `{ id }`:
 * zonder `project` en `cost` volgt een 400. Zie de kop van dit bestand.
 *
 * Let op de volgorde bij opruimen: dit maakt ook de gekoppelde bestelregels weer los, en pas
 * daarna zijn die regels zelf verwijderbaar.
 */
export async function verwijderBouw7Contract(
  soort: ContractSoort,
  contractId: number,
  context: { projectId: number; relatieBouw7Id: number; bedrag: string },
): Promise<VerwijderResultaat> {
  try {
    const client = await getBouw7Client()
    const isOa = soort === 'oa_contract'
    await client.del(PAD[soort], {
      id: contractId,
      project: { id: context.projectId },
      [isOa ? 'subcontractor' : 'supplier']: { id: context.relatieBouw7Id },
      cost: context.bedrag,
      status: await getConceptStatusId(soort),
      type: 0,
    })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

/** Contract teruglezen — voor verificatie en om de actuele Bouw7-status te tonen. */
export async function leesBouw7Contract(soort: ContractSoort, contractId: number) {
  const client = await getBouw7Client()
  return client.get<Record<string, unknown>>(`${PAD[soort]}/${contractId}`)
}

/** Staat het contract er nog, is het weg, of viel het niet vast te stellen? */
export type ContractStand = 'aanwezig' | 'verwijderd' | 'onbekend'

/**
 * Bestaat dit contract nog in Bouw7?
 *
 * `verwijderd` alleen bij een hard 404/410 of een lege response — élke andere fout (netwerk,
 * 401/403, kapotte JSON) levert `onbekend`. Die asymmetrie is bewust: een storing mag nooit als
 * "weggegooid" gelezen worden, want daarop wordt de contractkoppeling losgelaten en zouden de
 * regels opnieuw besteld kunnen worden — een dubbele order in Bouw7.
 */
export async function bestaatBouw7Contract(soort: ContractSoort, contractId: number): Promise<ContractStand> {
  try {
    const client = await getBouw7Client()
    const detail = await client.get<{ id?: number } | null>(`${PAD[soort]}/${contractId}`)
    return detail?.id != null ? 'aanwezig' : 'verwijderd'
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    return /\((404|410)\)/.test(msg) ? 'verwijderd' : 'onbekend'
  }
}

// ─── Al besteld? Bestelregels die elders aan een contract hangen ─────────────
//
// Een bestelregel kan in Bouw7 aan hooguit één contracttermijn hangen. Omdat EVA bestaande
// regels koppelt in plaats van nieuwe te maken (zie de kop van dit bestand), loopt het aanmaken
// van een order stuk zodra iemand diezelfde regels al in Bouw7 zelf onder een contract heeft
// gehangen — Bouw7 antwoordt dan met
//   "Contract order line with ID #… is already linked to contract term with ID #…".
// Dat is geen storing maar een feit over het project, en hoort dus vóór de POST gezien te
// worden: als blokkade met contractnummer erbij, niet als ruwe validatiefout achteraf.

/** Het contract waaraan een bestelregel al vastzit. */
export type BestelregelKoppeling = {
  contractId: number
  /** Contractnummer zoals Bouw7 het toont ("20267.00240OA005"); soms een vrije naam. */
  nummer: string | null
  soort: ContractSoort
}

type Bouw7KoppelRegel = {
  id?: number
  subcontractorContract?: { id?: number; number?: string | null } | null
  purchaseOrderContract?: { id?: number; number?: string | null } | null
}

/**
 * Welke bestelregels van dit project hangen al aan een inkooporder of OA-contract?
 *
 * Eén lijst-call voor het hele project; de aanroeper zoekt zelf zijn regels op. Regels die
 * nergens aan hangen ontbreken in de map — afwezig betekent dus "vrij om te koppelen".
 */
export async function haalBestelregelKoppelingen(projectId: number): Promise<Map<number, BestelregelKoppeling>> {
  const client = await getBouw7Client()
  const res = await client.get<{ items?: Bouw7KoppelRegel[] }>(
    '/list/contract-order-lines',
    { q: `project.id = ${projectId} LIMIT 1000` },
  )
  const uit = new Map<number, BestelregelKoppeling>()
  for (const regel of res?.items ?? []) {
    if (regel.id == null) continue
    const oa = regel.subcontractorContract
    const io = regel.purchaseOrderContract
    if (oa?.id != null) uit.set(Number(regel.id), { contractId: Number(oa.id), nummer: oa.number ?? null, soort: 'oa_contract' })
    else if (io?.id != null) uit.set(Number(regel.id), { contractId: Number(io.id), nummer: io.number ?? null, soort: 'inkooporder' })
  }
  return uit
}
