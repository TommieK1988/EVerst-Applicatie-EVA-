/**
 * pdf-bijlagen.ts
 *
 * Het achterste deel van een offerte-PDF: de eigen bijlages van de calculatie en
 * daarachter de algemene voorwaarden. De vaste volgorde is
 *
 *   briefpapier → offerte → bijlages → algemene voorwaarden → CONCEPT-watermerk
 *
 * Het briefpapier gaat er bewust vóór: een productblad of kwaliteitsverklaring van
 * een leverancier hoort niet op ons briefpapier afgedrukt te worden. Het watermerk
 * gaat er juist ná, zodat een conceptstempel ook op de bijlages staat.
 *
 * Deze module bestaat omdat het aanplakken van de algemene voorwaarden op drie
 * plekken los was overgeschreven (download, dossier-route, verzenden) en op een
 * vierde — de preview — helemaal ontbrak. Daardoor kreeg de klant iets anders te
 * zien dan de medewerker. Alle vier gebruiken nu deze functies.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalOp } from '@/lib/net/deadline'

export const BIJLAGE_BUCKET = 'offerte-bijlagen'

/** Bovengrens op het aantal bijlages dat we bij een offerte ophalen. */
const MAX_BIJLAGEN = 50

/**
 * Plakt PDF's achter elkaar. `extras` mag gaten bevatten (null/undefined) — die
 * worden overgeslagen, net als een bijlage die pdf-lib niet kan openen.
 *
 * Fail-soft is hier een bewuste keuze en niet luiheid: dit is precies het gedrag
 * dat de losse AV-append ook had. Een beschadigde bijlage mag nooit betekenen dat
 * er helemaal geen offerte uit komt — de rest van het document klopt gewoon.
 */
export async function voegPdfsSamen(
  basis: Uint8Array | Buffer,
  extras: (Uint8Array | Buffer | null | undefined)[],
): Promise<Uint8Array> {
  const teVoegen = extras.filter((e): e is Uint8Array | Buffer => !!e && e.byteLength > 0)
  if (teVoegen.length === 0) return basis instanceof Uint8Array ? basis : new Uint8Array(basis)

  try {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(basis, { ignoreEncryption: true })
    for (const extra of teVoegen) {
      try {
        const bron = await PDFDocument.load(extra, { ignoreEncryption: true })
        const paginas = await doc.copyPages(bron, bron.getPageIndices())
        paginas.forEach(p => doc.addPage(p))
      } catch (e) {
        console.warn('Bijlage overgeslagen bij het samenvoegen van de offerte-PDF:', e)
      }
    }
    return await doc.save()
  } catch (e) {
    console.warn('Samenvoegen mislukt, offerte zonder bijlages:', e)
    return basis instanceof Uint8Array ? basis : new Uint8Array(basis)
  }
}

/**
 * De bevroren bijlages van een offerte, op volgorde, als PDF-bytes.
 *
 * Leest met de admin-client: de bestanden staan in een privébucket en we hebben
 * hier geen signed URL nodig — dit draait server-side in de PDF-pijplijn.
 */
export async function haalQuoteBijlagenPdfs(quoteId: string): Promise<Uint8Array[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data, error } = await admin
      .from('quote_bijlagen')
      .select('pad, bestandsnaam, volgorde')
      .eq('quote_id', quoteId)
      .order('volgorde', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(MAX_BIJLAGEN)
    if (error || !data?.length) return []

    const bytes: Uint8Array[] = []
    for (const rij of data as { pad: string; bestandsnaam: string }[]) {
      const { data: blob, error: dlErr } = await admin.storage.from(BIJLAGE_BUCKET).download(rij.pad)
      if (dlErr || !blob) {
        // Luid loggen: een bijlage die de klant had moeten zien ontbreekt nu.
        console.error(`Offertebijlage "${rij.bestandsnaam}" (${rij.pad}) kon niet worden opgehaald:`, dlErr)
        continue
      }
      bytes.push(new Uint8Array(await blob.arrayBuffer()))
    }
    return bytes
  } catch (e) {
    console.error('Offertebijlages ophalen mislukt:', e)
    return []
  }
}

/** De algemene-voorwaarden-PDF bij een offerte (best-effort; null als er geen is). */
export async function haalVoorwaardenPdf(bestandUrl?: string | null): Promise<Uint8Array | null> {
  if (!bestandUrl) return null
  try {
    const res = await haalOp(bestandUrl, { dienst: 'Voorwaarden-PDF', timeoutMs: 20_000 })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    console.warn('Voorwaarden ophalen mislukt:', e)
    return null
  }
}
