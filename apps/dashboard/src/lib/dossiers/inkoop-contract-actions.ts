'use server'

/**
 * Openen en intrekken van een inkooporder of OA-contract vanaf het Inkoop-tab.
 *
 * Bron is het contract in Bouw7 zelf (`GET /contracts/{soort}/{id}`): dat heeft de termijnen mét
 * hun bestelregels, en werkt ook voor contracten die rechtstreeks in Bouw7 zijn gemaakt. Een
 * EVA-bestelling erbij levert alleen nog het verstuurd-moment en het document.
 *
 * LET OP — alleen async exports (zie `feedback_use_server_geen_sync_exports`); types staan in
 * `inkoop-contract-types.ts`.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { leesBouw7Contract } from '@/lib/bouw7/contracten'
import { assertDossierBewerkbaar } from './guards'
import { trekContractInKern, type IntrekResultaat } from './inkoop-intrekken'
import type {
  InkoopContractDetail, InkoopContractRegel, InkoopContractSoort, InkoopContractTermijn,
} from './inkoop-contract-types'

type Uitkomst<T> = { ok: true; data: T } | { ok: false; error: string }

const getal = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const tekst = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}
const geldigeSoort = (s: string): s is InkoopContractSoort => s === 'inkooporder' || s === 'oa_contract'

type Bouw7Regel = {
  description?: string | null; unit?: string | null; quantity?: string | null; quantityFactor?: string | null
  unitPrice?: string | null; totalPrice?: string | null; projectSecurityLink?: { code?: string | null } | null
}
type Bouw7Termijn = {
  description?: string | null; unit?: string | null; amount?: string | null; unitPrice?: string | null
  subTotal?: string | null; projectSecurityLink?: { code?: string | null } | null
  contractOrderLines?: Bouw7Regel[] | null
  deliveryTickets?: { ticketNumber?: string | null; processed?: boolean | null }[] | null
}
type Bouw7Partij = { name?: string | null; email?: string | null; phoneNumber?: string | null }

/** Alles wat er in dit contract besteld of opgedragen is. */
export async function getInkoopContractDetail(
  dossierId: string,
  soort: string,
  contractId: number,
): Promise<Uitkomst<InkoopContractDetail>> {
  try {
    await vereisRecht('dossiers', 'lezen')
    if (!geldigeSoort(soort) || !Number.isFinite(contractId)) return { ok: false, error: 'Ongeldig contract.' }

    const db = createAdminClient()
    const { data: dossier } = await db.from('dossiers').select('bouw7_id').eq('id', dossierId).maybeSingle()
    if (dossier?.bouw7_id == null) return { ok: false, error: 'Dit dossier heeft geen Bouw7-koppeling.' }

    const d = await leesBouw7Contract(soort, contractId)
    if (Number((d.project as { id?: number } | undefined)?.id) !== Number(dossier.bouw7_id)) {
      return { ok: false, error: 'Dit contract hoort niet bij dit dossier.' }
    }

    const termijnenRuw = (d.contractTerms as Bouw7Termijn[] | undefined) ?? []
    const termijnen: InkoopContractTermijn[] = termijnenRuw.map(t => {
      const regels: InkoopContractRegel[] = (t.contractOrderLines ?? []).map(r => {
        const aantal = getal(r.quantity)
        const factor = getal(r.quantityFactor) ?? 1
        return {
          omschrijving: tekst(r.description) ?? '—',
          aantal: aantal != null ? aantal * factor : null,
          eenheid: tekst(r.unit),
          stukprijs: getal(r.unitPrice),
          bedrag: getal(r.totalPrice),
          code: tekst(r.projectSecurityLink?.code),
        }
      })
      // Een termijn zonder bestelregels (bv. een vaste aanneemsom) is zelf het opgedragen werk.
      if (regels.length === 0) {
        regels.push({
          omschrijving: tekst(t.description) ?? '—',
          aantal: getal(t.amount),
          eenheid: tekst(t.unit),
          stukprijs: getal(t.unitPrice),
          bedrag: getal(t.subTotal),
          code: tekst(t.projectSecurityLink?.code),
        })
      }
      return { omschrijving: tekst(t.description) ?? '', bedrag: getal(t.subTotal), regels }
    })
    const geboekteBonnen = termijnenRuw
      .flatMap(t => t.deliveryTickets ?? [])
      .filter(b => b.processed)
      .map(b => b.ticketNumber ?? '?')

    const partij = ((soort === 'oa_contract' ? d.subcontractor : d.supplier) ?? null) as Bouw7Partij | null

    const { data: best } = await db
      .from('werkbegroting_bestellingen')
      .select('id, verstuurd_op, verstuurd_naar, is_reservering, sjabloon_id')
      .eq('bouw7_contract_id', contractId)
      .maybeSingle()
    let documentUrl: string | null = null
    if (best?.id) {
      const { data: doc } = await db
        .from('dossier_documenten')
        .select('sharepoint_web_url')
        .eq('bestelling_id', best.id)
        .not('sharepoint_web_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      documentUrl = doc?.sharepoint_web_url ?? null
    }

    return {
      ok: true,
      data: {
        soort,
        contractId,
        nummer: tekst(d.number),
        naam: tekst(d.name),
        omschrijving: tekst(d.description),
        partij: tekst(partij?.name),
        partijEmail: tekst(partij?.email),
        partijTelefoon: tekst(partij?.phoneNumber),
        bedrag: getal(d.cost),
        startdatum: tekst(d.startDate) ?? tekst(d.startDateText),
        opleverdatum: tekst(d.expectedCompletionDate) ?? tekst(d.deliveryDate)
          ?? tekst(d.expectedCompletionDateText) ?? tekst(d.deliveryDateText),
        betaalafspraak: tekst(d.paymentAgreement),
        termijnen,
        geboekteBonnen,
        uitEva: !!best,
        bestellingId: best?.id ?? null,
        isReservering: !!best?.is_reservering,
        sjabloonId: best?.sjabloon_id ?? null,
        verstuurdOp: best?.verstuurd_op ?? null,
        verstuurdNaar: best?.verstuurd_naar ?? null,
        documentUrl,
      },
    }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Contract ophalen mislukt' }
  }
}

/**
 * Een inkooporder of OA-contract intrekken, ook als het al verstuurd is. Zie `trekContractInKern`.
 * Er gaat geen mail naar de partij — het bevestigvenster zegt dat de gebruiker dat zelf doet.
 */
export async function trekInkoopContractIn(
  dossierId: string,
  soort: string,
  contractId: number,
): Promise<IntrekResultaat> {
  try {
    const { medewerker } = await vereisRecht('dossiers', 'schrijven')
    if (!geldigeSoort(soort) || !Number.isFinite(contractId)) return { ok: false, error: 'Ongeldig contract.' }
    await assertDossierBewerkbaar(dossierId)
    const res = await trekContractInKern(dossierId, soort, contractId, medewerker.id)
    if (res.ok) {
      revalidatePath(`/dossiers/${dossierId}`, 'layout')
      revalidatePath(`/servicedesk/${dossierId}`, 'layout')
    }
    return res
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Intrekken mislukt' }
  }
}
