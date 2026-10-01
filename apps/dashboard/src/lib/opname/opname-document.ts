import 'server-only'

/**
 * Het opnamedocument maken, in de SharePoint-dossiermap zetten en vrijgeven in de app.
 *
 * Draait automatisch na het afronden van een opname (via `after()` in `rondOpnameAf`) en op verzoek
 * via "Opnieuw maken" op de Opname-tab. De autorisatie ligt bij die aanroepers; deze functie doet
 * zelf geen sessiecontrole en hoort daarom niet in een 'use server'-bestand.
 *
 * Best-effort: gooit nooit. De uitkomst staat op de opname (`document_*`), zodat de tab kan laten
 * zien dat het document ontbreekt en waarom.
 */

import { archiveerEnRegistreer } from '@/lib/documenten/archiveer'
import { OPNAME_DOCUMENTSOORT } from '@/lib/documenten/types'
import { zetAppZichtbaar } from '@/lib/dossiers/app-zichtbaar'
import { laadPdfAfzender } from '@/lib/pdf/afzender'
import { laadPdfLogo } from '@/lib/pdf/logo'
import { losseTabel } from '@/lib/supabase/losse-tabel'
import { laadDocumentFotos, laadOpnameVoorDocument } from './opname-document-gegevens'
import {
  ALGEMEEN_FOTO_MAX_PX,
  REGEL_FOTO_MAX_PX,
  bouwOpnameDocumentPdf,
  opnameDocumentBestandsnaam,
} from './opname-document-pdf'

export type OpnameDocumentResultaat =
  | { ok: true; webUrl: string | null; inApp: boolean }
  | { ok: false; error: string }

export async function maakEnArchiveerOpnameDocument(
  opnameId: string,
  medewerkerId: string | null,
): Promise<OpnameDocumentResultaat> {
  const supabase = losseTabel()
  const legVast = async (velden: Record<string, unknown>) => {
    try {
      await supabase.from('opnames').update(velden).eq('id', opnameId)
    } catch (e) {
      console.warn('Opnamedocument: status vastleggen mislukt', e)
    }
  }

  try {
    const gegevens = await laadOpnameVoorDocument(opnameId)
    if (!gegevens) return { ok: false, error: 'Opname niet gevonden' }

    // Thumbnails en het raster vragen een andere maat; een foto die in beide zou staan bestaat
    // niet (een foto hangt aan een regel óf is algemeen).
    const regelUrls = [...gegevens.fotosPerRegel.values()].flat().map(f => f.url)
    const algemeenUrls = gegevens.algemeneFotos.map(f => f.url)
    const [regelFotos, algemeneFotos, logo] = await Promise.all([
      laadDocumentFotos(regelUrls, REGEL_FOTO_MAX_PX),
      laadDocumentFotos(algemeenUrls, ALGEMEEN_FOTO_MAX_PX),
      laadPdfAfzender().then(a => laadPdfLogo(a.logoUrl)),
    ])
    const fotoBytes = new Map([...regelFotos, ...algemeneFotos])

    const bytes = await bouwOpnameDocumentPdf(gegevens, fotoBytes, logo)
    const bestandsnaam = opnameDocumentBestandsnaam(gegevens.opname.opnamenummer, gegevens.opname.adres)

    const archief = await archiveerEnRegistreer({
      supabase,
      dossierId: gegevens.dossier.id,
      sjabloon: null,
      documentsoort: OPNAME_DOCUMENTSOORT,
      invoer: { opname_id: opnameId },
      bestandsnaam,
      bytes,
      medewerkerId,
      archiveren: true,
    })

    if (!archief.ok || !archief.itemId) {
      const fout = archief.fout ?? 'Het document kon niet in de SharePoint-dossiermap worden gezet.'
      await legVast({ document_fout: fout })
      return { ok: false, error: fout }
    }

    // Eén opname = één document. SharePoint overschrijft het bestand al; ruim hier ook de oudere
    // indexrijen op, anders staat het na elke herafronding een keer extra in de documentenlijst.
    if (archief.documentId) {
      try {
        await supabase
          .from('dossier_documenten')
          .delete()
          .eq('dossier_id', gegevens.dossier.id)
          .eq('documentsoort', OPNAME_DOCUMENTSOORT)
          .eq('invoer->>opname_id', opnameId)
          .neq('id', archief.documentId)
      } catch (e) {
        console.warn('Opnamedocument: oude registraties opruimen mislukt', e)
      }
    }

    // Zelfde sleutel als de Bestanden-tab (`BestandRij.sleutel`). Overschrijven houdt het item-id
    // gelijk, dus bij "opnieuw maken" blijft het vinkje gewoon staan.
    const app = await zetAppZichtbaar(supabase, {
      dossierId: gegevens.dossier.id,
      sleutel: `sharepoint:${archief.itemId}`,
      zichtbaar: true,
      medewerkerId,
    })

    await legVast({
      document_sharepoint_item_id: archief.itemId,
      document_web_url: archief.webUrl ?? null,
      document_gemaakt_op: new Date().toISOString(),
      document_fout: app.ok ? null : `Staat in SharePoint, maar niet in de app gezet: ${app.error}`,
    })

    return { ok: true, webUrl: archief.webUrl ?? null, inApp: app.ok }
  } catch (e) {
    const fout = e instanceof Error ? e.message : 'Opnamedocument maken mislukt'
    console.error('Opnamedocument maken mislukt', opnameId, e)
    await legVast({ document_fout: fout })
    return { ok: false, error: fout }
  }
}
