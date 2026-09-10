import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * De afzender van een PDF: wie staat er boven het vel, in welke huisstijlkleur,
 * met welk logo.
 *
 * `bedrijfsgegevens` is géén singleton. De tabel bevat de moederorganisatie én
 * de werkmaatschappijen (Onderhoudsschilders, Dakplan, Morgenstond). Een kale
 * `.limit(1).maybeSingle()` pakt daar een willekeurige uit, en dan staat er
 * "Dakdekkersbedrijf Dakplan B.V." boven het vel van een schildersdossier. Dat
 * is precies wat er gebeurde, in vijf PDF-routes tegelijk — vandaar dat de
 * query hier één keer staat in plaats van vijf keer overgeschreven.
 *
 * Filter dus op de organisatie (`parent_id is null`): dat is de afzender, en
 * ook de enige rij die een logo en `kleur_primair` heeft.
 *
 * De werkmaatschappij van een dóssier is iets anders — die komt uit
 * `dossiers.werkmaatschappij_id` en hoort hooguit als kopveld op het vel, nooit
 * als afzender.
 */
export type PdfAfzender = {
  naam: string | null
  /** Huisstijlkleur uit `bedrijfsgegevens.kleur_primair`; null → de PDF houdt zijn eigen kleur aan. */
  kleurPrimair: string | null
  /** Primair logo, met het oude `logo_url` als terugval. Voer dit aan `laadPdfLogo`. */
  logoUrl: string | null
}

const LEEG: PdfAfzender = { naam: null, kleurPrimair: null, logoUrl: null }

export async function laadPdfAfzender(): Promise<PdfAfzender> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data } = await supabase
    .from('bedrijfsgegevens')
    .select('naam, kleur_primair, logo_primair_url, logo_url')
    .is('parent_id', null)
    .order('naam')
    .limit(1)
    .maybeSingle()

  const org = data as
    | { naam: string | null; kleur_primair: string | null; logo_primair_url: string | null; logo_url: string | null }
    | null

  if (!org) return LEEG

  return {
    naam: org.naam ?? null,
    kleurPrimair: org.kleur_primair ?? null,
    logoUrl: org.logo_primair_url ?? org.logo_url ?? null,
  }
}
