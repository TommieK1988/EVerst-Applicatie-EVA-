import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import jsPDF from 'jspdf'
import type { FormField, FormInstellingen } from '@/components/formulieren/types'
import {
  mergePdfConfig, hexNaarRgb, urlNaarBase64, buildBlokken,
  tekenKop, renderReport, tekenPaginavoettekst, pasBriefpapierToe,
  type GlobalePdfConfig, type Marge,
} from '@/components/formulieren/pdf-schema'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  // Object-level authz: de PDF wordt met de admin-client (bypast RLS) opgebouwd — vereis
  // lees-recht op de formulieren-module zodat niet elke ingelogde gebruiker een inzending kan ophalen.
  try {
    await vereisRecht('formulieren', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const { subId } = await params
  const supabase  = createAdminClient()

  // Laad inzending + versie + template
  const { data: inzending, error } = await supabase
    .from('form_inzendingen')
    .select('*, versie:versie_id(*), template:template_id(*)')
    .eq('id', subId)
    .maybeSingle()

  if (error || !inzending) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  const template = inzending.template as { naam: string } | null
  const versie   = inzending.versie   as unknown as { schema: { fields: FormField[]; instellingen?: FormInstellingen }; versienummer: number } | null
  const fields   = versie?.schema?.fields ?? []
  const waarden  = inzending.waarden as Record<string, unknown>
  const instellingen = versie?.schema?.instellingen

  // Laad PDF-config + bedrijfsgegevens
  const [pdfConfigResult, bedrijfResult] = await Promise.all([
    supabase.from('formulier_pdf_config').select('*').limit(1).maybeSingle(),
    supabase.from('bedrijfsgegevens').select('naam, logo_primair_url, logo_url').limit(1).maybeSingle(),
  ])

  // Per-sjabloon PDF-instellingen over de globale singleton leggen.
  const pdfConfig = mergePdfConfig(pdfConfigResult.data as GlobalePdfConfig, instellingen?.pdf)
  const accentRgb = hexNaarRgb(instellingen?.accentkleur)

  const bedrijf = bedrijfResult.data as {
    naam: string | null; logo_primair_url: string | null; logo_url: string | null
  } | null

  // ── Genereer PDF ──────────────────────────────────────────────────
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const briefpapier = !!pdfConfig.briefpapierUrl
  const marge: Marge = briefpapier
    ? { boven: pdfConfig.briefpapierMargeBoven, onder: pdfConfig.briefpapierMargeOnder, links: 20, rechts: 20 }
    : { boven: 18, onder: 16, links: 18, rechts: 18 }

  // Logo alleen zonder briefpapier (briefpapier heeft een eigen briefhoofd).
  const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
  const logo = pdfConfig.toonLogo && !briefpapier && logoUrl ? await urlNaarBase64(logoUrl) : null

  // Meta-regel
  const metaDelen: string[] = []
  if (pdfConfig.koptekst) metaDelen.push(pdfConfig.koptekst)
  if (pdfConfig.toonInvuller && inzending.ingediend_op) {
    metaDelen.push(`Ingediend: ${new Date(inzending.ingediend_op as string).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  }
  if (pdfConfig.toonProjectRef && inzending.project_ref) metaDelen.push(`Project: ${inzending.project_ref}`)
  metaDelen.push(`Status: ${inzending.status}`)

  const startY = tekenKop(doc, {
    titel: template?.naam ?? 'Formulier',
    subtitel: `v${versie?.versienummer ?? 1}`,
    metaDelen,
    logo,
    briefpapier,
    pageW, pageH, marge, accentRgb,
  })

  const blokken = await buildBlokken(fields, f => waarden[f.id], {})
  await renderReport(doc, blokken, { startY, pageW, pageH, marge, accentRgb })

  tekenPaginavoettekst(doc, {
    voettekst: pdfConfig.voettekst ?? bedrijf?.naam ?? '',
    briefpapier, pageW, pageH, marge,
  })

  // Briefpapier als achtergrond onder elke pagina (best-effort).
  const pdfBytes = await pasBriefpapierToe(doc.output('arraybuffer'), pdfConfig.briefpapierUrl)
  const veiligNaam = (template?.naam ?? 'formulier').replace(/[^a-z0-9]/gi, '-').toLowerCase()

  return new NextResponse(pdfBytes as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${veiligNaam}-${subId.slice(0, 8)}.pdf"`,
    },
  })
}
