import 'server-only'
import { createAdminClient } from '@everts/database/server'
import jsPDF from 'jspdf'
import type { FormField, FormInstellingen } from '@/components/formulieren/types'
import {
  mergePdfConfig, hexNaarRgb, urlNaarBase64, buildBlokken,
  tekenKop, renderReport, tekenPaginavoettekst, pasBriefpapierToe,
  type GlobalePdfConfig, type Marge,
} from '@/components/formulieren/pdf-schema'

/**
 * inzending-pdf.ts
 *
 * De PDF van een ingevuld formulier. Stond eerst helemaal in de route-handler
 * onder /formulieren/[id]/inzendingen/[subId]/pdf; hier uitgelicht omdat het
 * klantportaal dezelfde PDF nodig heeft achter een héél andere autorisatie.
 * Twee kopieën zouden onvermijdelijk uit elkaar lopen — dan krijgt de klant een
 * andere opmaak dan de collega die hem doorstuurt.
 *
 * Deze functie doet zelf GEEN autorisatie. Dat is met opzet: de twee aanroepers
 * hebben elk hun eigen poort (vereisRecht respectievelijk vereisPortaalOnderdeel).
 * Roep hem dus nooit aan zonder eerst te controleren wie er vraagt.
 */

export type InzendingPdf = {
  bytes: ArrayBuffer
  bestandsnaam: string
}

export async function bouwInzendingPdf(inzendingId: string): Promise<InzendingPdf | null> {
  const supabase = createAdminClient()

  const { data: inzending, error } = await supabase
    .from('form_inzendingen')
    .select('*, versie:versie_id(*), template:template_id(*)')
    .eq('id', inzendingId)
    .maybeSingle()

  if (error || !inzending) return null

  const template = inzending.template as { naam: string } | null
  const versie = inzending.versie as unknown as {
    schema: { fields: FormField[]; instellingen?: FormInstellingen }; versienummer: number
  } | null
  const fields = versie?.schema?.fields ?? []
  const waarden = inzending.waarden as Record<string, unknown>
  const instellingen = versie?.schema?.instellingen

  const [pdfConfigResult, bedrijfResult] = await Promise.all([
    supabase.from('formulier_pdf_config').select('*').limit(1).maybeSingle(),
    supabase.from('bedrijfsgegevens').select('naam, logo_primair_url, logo_url').limit(1).maybeSingle(),
  ])

  const pdfConfig = mergePdfConfig(pdfConfigResult.data as GlobalePdfConfig, instellingen?.pdf)
  const accentRgb = hexNaarRgb(instellingen?.accentkleur)

  const bedrijf = bedrijfResult.data as {
    naam: string | null; logo_primair_url: string | null; logo_url: string | null
  } | null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const briefpapier = !!pdfConfig.briefpapierUrl
  const marge: Marge = briefpapier
    ? { boven: pdfConfig.briefpapierMargeBoven, onder: pdfConfig.briefpapierMargeOnder, links: 20, rechts: 20 }
    : { boven: 18, onder: 16, links: 18, rechts: 18 }

  // Logo alleen zonder briefpapier (briefpapier heeft een eigen briefhoofd).
  const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
  const logo = pdfConfig.toonLogo && !briefpapier && logoUrl ? await urlNaarBase64(logoUrl) : null

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

  const bytes = await pasBriefpapierToe(doc.output('arraybuffer'), pdfConfig.briefpapierUrl)
  const veiligNaam = (template?.naam ?? 'formulier').replace(/[^a-z0-9]/gi, '-').toLowerCase()

  return {
    bytes: bytes as ArrayBuffer,
    bestandsnaam: `${veiligNaam}-${inzendingId.slice(0, 8)}.pdf`,
  }
}
