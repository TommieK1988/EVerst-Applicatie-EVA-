import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { maakToegangToken } from '@/lib/dossiers/oplevering'
import { queueOpleverMail, bouwHerinneringMail, bouwFeedbackUitnodigingMail } from '@/lib/dossiers/oplevering-mail'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Aantal dagen na de opleverdatum waarop de feedback-ronde wordt klaargezet. */
const FEEDBACK_NA_DAGEN = 7
/** Tokenlinks in mails blijven een maand geldig. */
const LINK_GELDIG_DAGEN = 30

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * GET|POST /api/cron/oplevering
 *
 * Zet opleveringsmails klaar in de wachtrij:
 *  1. Herinnering aan elke onderaannemer met nog niet-geaccepteerde opleverpunten (incl. afmeldlink).
 *  2. Feedback-uitnodiging, FEEDBACK_NA_DAGEN dagen na een ondertekende/afgeronde oplevering.
 *
 * Verstuurt bewust NIETS: EVA mailt via Graph namens een ingelogde medewerker en een cron heeft
 * geen sessie. De berichten gaan pas weg wanneer iemand is ingelogd en de wachtrij vrijgeeft
 * (Oplevering-tab → "Nu versturen"). Een unieke index op (dossier, soort, sleutel) voorkomt dat
 * dagelijks draaien dubbele herinneringen stapelt.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const supabase = db()
  let herinneringen = 0
  let feedback = 0

  try {
    /* ── 1. Herinneringen aan onderaannemers met openstaande punten ── */
    const { data: openPunten } = await supabase
      .from('oplever_punten')
      .select('dossier_id, toegewezen_relatie_id, status')
      .eq('toegewezen_type', 'relatie')
      .not('toegewezen_relatie_id', 'is', null)
      .not('status', 'in', '("geaccepteerd","afgewezen")')

    // Tel per (dossier, relatie) hoeveel punten er nog open staan.
    const perPaar = new Map<string, { dossierId: string; relatieId: string; aantal: number }>()
    for (const p of (openPunten ?? []) as any[]) {
      const sleutel = `${p.dossier_id}|${p.toegewezen_relatie_id}`
      const rij = perPaar.get(sleutel) ?? { dossierId: p.dossier_id, relatieId: p.toegewezen_relatie_id, aantal: 0 }
      rij.aantal++
      perPaar.set(sleutel, rij)
    }

    for (const { dossierId, relatieId, aantal } of perPaar.values()) {
      const [{ data: relatie }, { data: dossier }] = await Promise.all([
        supabase.from('relaties').select('naam, email').eq('id', relatieId).maybeSingle(),
        supabase.from('dossiers').select('titel, dossiernummer').eq('id', dossierId).maybeSingle(),
      ])
      if (!relatie?.email) continue // zonder adres valt er niets klaar te zetten

      // Sla het minten van een token over als er al een herinnering klaarstaat.
      const { data: bestaand } = await supabase
        .from('oplever_mail_wachtrij')
        .select('id')
        .eq('dossier_id', dossierId)
        .eq('soort', 'herinnering')
        .eq('sleutel', `relatie:${relatieId}`)
        .eq('status', 'wachtend')
        .maybeSingle()
      if (bestaand) continue

      const link = await maakToegangToken('onderaannemer', {
        dossierId, relatieId, geldigDagen: LINK_GELDIG_DAGEN, omschrijving: relatie.naam,
      })
      if (!link.ok) continue

      const projectnaam = dossier?.titel ?? dossier?.dossiernummer ?? 'uw project'
      const { onderwerp, bodyHtml } = await bouwHerinneringMail(relatie.naam, projectnaam, aantal, link.url)
      const res = await queueOpleverMail({
        dossierId, soort: 'herinnering', ontvangers: [relatie.email],
        onderwerp, bodyHtml, sleutel: `relatie:${relatieId}`, relatieId,
      })
      if (res.ok && res.id) herinneringen++
    }

    /* ── 2. Feedback-uitnodiging na een afgeronde oplevering ── */
    const grens = new Date(Date.now() - FEEDBACK_NA_DAGEN * 86400_000).toISOString().slice(0, 10)
    const { data: momenten } = await supabase
      .from('oplever_momenten')
      .select('id, dossier_id, opgeleverd_op, status')
      .in('status', ['ondertekend', 'afgerond'])
      .not('opgeleverd_op', 'is', null)
      .lte('opgeleverd_op', grens)

    // Zonder gepubliceerd feedbacksjabloon valt er niets uit te sturen.
    const { data: sjabloon } = await supabase
      .from('form_templates')
      .select('id')
      .eq('categorie', 'oplevering')
      .eq('status', 'gepubliceerd')
      .order('naam')
      .limit(1)
      .maybeSingle()

    if (sjabloon) {
      for (const m of (momenten ?? []) as any[]) {
        const { data: dossier } = await supabase
          .from('dossiers').select('titel, dossiernummer, klant_id').eq('id', m.dossier_id).maybeSingle()
        if (!dossier?.klant_id) continue
        const { data: klant } = await supabase.from('relaties').select('email').eq('id', dossier.klant_id).maybeSingle()
        if (!klant?.email) continue

        const { data: bestaand } = await supabase
          .from('oplever_mail_wachtrij')
          .select('id')
          .eq('dossier_id', m.dossier_id)
          .eq('soort', 'feedback_uitnodiging')
          .eq('sleutel', `moment:${m.id}`)
          .in('status', ['wachtend', 'verzonden'])
          .maybeSingle()
        if (bestaand) continue

        const link = await maakToegangToken('feedback', {
          dossierId: m.dossier_id, formTemplateId: sjabloon.id, geldigDagen: 60,
        })
        if (!link.ok) continue

        const projectnaam = dossier.titel ?? dossier.dossiernummer ?? 'uw project'
        const { onderwerp, bodyHtml } = await bouwFeedbackUitnodigingMail(projectnaam, link.url)
        const res = await queueOpleverMail({
          dossierId: m.dossier_id, soort: 'feedback_uitnodiging', ontvangers: [klant.email],
          onderwerp, bodyHtml, sleutel: `moment:${m.id}`, momentId: m.id,
        })
        if (res.ok && res.id) feedback++
      }
    }

    return NextResponse.json({
      ok: true,
      klaargezet: { herinneringen, feedback_uitnodigingen: feedback },
      opmerking: 'Berichten staan in de wachtrij; versturen gebeurt door een ingelogde medewerker.',
      duur_ms: Date.now() - startedAt,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
