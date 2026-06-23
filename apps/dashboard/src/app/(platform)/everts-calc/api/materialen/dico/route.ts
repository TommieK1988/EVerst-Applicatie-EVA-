import { NextRequest, NextResponse } from 'next/server'
import { parseDicoArtikelen } from '@/lib/everts-calc/dico/parse'
import { importMaterialen } from '@/app/(platform)/everts-calc/actions/materialen'

// DICO-bestandimport: ontvangt een DICO/Ketenstandaard artikel-XML (multipart of raw),
// parseert de artikelen en synchroniseert ze naar evc_materialen (bron 'dico_import').
export async function POST(req: NextRequest) {
  try {
    let xml = ''
    let standaardLeverancier: string | undefined

    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const bestand = form.get('file')
      if (bestand && typeof bestand !== 'string') {
        xml = await bestand.text()
      }
      const lev = form.get('leverancier')
      if (typeof lev === 'string' && lev.trim()) standaardLeverancier = lev.trim()
    } else {
      xml = await req.text()
    }

    if (!xml.trim()) {
      return NextResponse.json({ error: 'Geen bestandsinhoud ontvangen' }, { status: 400 })
    }

    const { items, gevonden } = parseDicoArtikelen(xml, standaardLeverancier)
    if (!items.length) {
      return NextResponse.json(
        { error: 'Geen artikelen herkend in het DICO-bestand', gevonden },
        { status: 422 },
      )
    }

    const resultaat = await importMaterialen(items, 'dico_import')
    return NextResponse.json({ gevonden, ...resultaat })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout bij DICO-import' },
      { status: 500 },
    )
  }
}
