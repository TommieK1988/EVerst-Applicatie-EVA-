import 'server-only'

/**
 * De gegevens voor het opnamedocument: wat er ter plaatse is opgenomen, zónder prijzen.
 *
 * Het document gaat naar de buitendienst (app) en kan doorgestuurd worden naar de corporatie. De
 * prijsafspraken mogen er dus nooit in terechtkomen. Dat wordt hier afgedwongen, in de query: de
 * select-lijst van `opname_regels` noemt alleen prijsloze kolommen, zodat ook een latere wijziging
 * aan de opmaak geen bedrag kan laten uitlekken.
 *
 * Draait op de admin-client: de aanroep loopt ook vanuit `after()` na het afronden, en de
 * autorisatie is dan al gedaan door de server action die hem startte.
 */

import type { OpnameFotoSoort, OpnameSoort, OpnameStatus } from '@everts/database/opname-types'
import { volledigeNaam } from '@/lib/documenten/format'
import { mapMetLimiet } from '@/lib/documenten/rapport-fotos'
import { haalAfbeelding } from '@/lib/pdf/afbeelding'
import { losseTabel, type Rij } from '@/lib/supabase/losse-tabel'

/** Bewust een eigen, smal type: geen enkel prijsveld uit `OpnameRegel`. */
export type DocumentRegel = {
  id: string
  ruimte: string | null
  volgorde: number
  onderdeel_code: string | null
  omschrijving: string
  aantal: number
  eenheid: string
  toelichting_opnemer: string | null
}

export type DocumentFoto = {
  regel_id: string | null
  url: string
  soort: OpnameFotoSoort
  omschrijving: string | null
}

export type DocumentRuimte = { ruimte: string; regels: DocumentRegel[] }

export type OpnameDocumentGegevens = {
  opname: {
    id: string
    opnamenummer: string
    soort: OpnameSoort
    status: OpnameStatus
    datum: string
    adres: string | null
    vhe: string | null
    opmerking: string | null
    opnemer: string | null
  }
  dossier: { id: string; nummer: string | null; titel: string | null }
  opdrachtgever: string | null
  ruimtes: DocumentRuimte[]
  /** Foto's per regel-id, in de volgorde van de opname. */
  fotosPerRegel: Map<string, DocumentFoto[]>
  /** Foto's zonder regel: de algemene foto's bij de opname. */
  algemeneFotos: DocumentFoto[]
}

const REGEL_KOLOMMEN = 'id, ruimte, volgorde, onderdeel_code, omschrijving, aantal, eenheid, toelichting_opnemer'

/**
 * Zelfde indeling als `groepeerPerRuimte` (op de ruimtenaam, leeg = "Overig"), maar dan zonder het
 * verkooptotaal — dat kent dit type niet.
 */
function perRuimte(regels: DocumentRegel[]): DocumentRuimte[] {
  const groepen = new Map<string, DocumentRegel[]>()
  for (const regel of regels) {
    const sleutel = regel.ruimte?.trim() || 'Overig'
    const bestaand = groepen.get(sleutel)
    if (bestaand) bestaand.push(regel)
    else groepen.set(sleutel, [regel])
  }
  return Array.from(groepen, ([ruimte, eigen]) => ({
    ruimte,
    regels: [...eigen].sort((a, b) => a.volgorde - b.volgorde),
  }))
}

export async function laadOpnameVoorDocument(opnameId: string): Promise<OpnameDocumentGegevens | null> {
  const supabase = losseTabel()
  const { data: rij } = await supabase
    .from('opnames')
    .select('id, opnamenummer, soort, status, datum, adres_vrij, vhe_aanduiding, opmerking, dossier_id, relatie_id, opnemer_id')
    .eq('id', opnameId)
    .maybeSingle()
  if (!rij) return null
  const opname = rij as unknown as {
    id: string; opnamenummer: string; soort: OpnameSoort; status: OpnameStatus; datum: string
    adres_vrij: string | null; vhe_aanduiding: string | null; opmerking: string | null
    dossier_id: string; relatie_id: string | null; opnemer_id: string | null
  }

  // Allemaal begrensd door `opname_id` of één rij: geen paginering nodig.
  const leeg = Promise.resolve({ data: null as Rij | null, error: null })
  const [{ data: regels, error: regelFout }, { data: fotos }, { data: dossier }, relatie, opnemer] =
    await Promise.all([
      supabase.from('opname_regels').select(REGEL_KOLOMMEN).eq('opname_id', opnameId).order('volgorde'),
      supabase
        .from('opname_fotos')
        .select('regel_id, url, soort, omschrijving, volgorde')
        .eq('opname_id', opnameId)
        .order('volgorde'),
      supabase.from('dossiers').select('id, dossiernummer, titel').eq('id', opname.dossier_id).maybeSingle(),
      opname.relatie_id
        ? supabase.from('relaties').select('naam').eq('id', opname.relatie_id).maybeSingle()
        : leeg,
      opname.opnemer_id
        ? supabase
            .from('medewerkers')
            .select('voornaam, tussenvoegsel, achternaam')
            .eq('id', opname.opnemer_id)
            .maybeSingle()
        : leeg,
    ])
  if (regelFout) throw new Error(`Opnameregels ophalen mislukt: ${regelFout.message}`)

  const fotosPerRegel = new Map<string, DocumentFoto[]>()
  const algemeneFotos: DocumentFoto[] = []
  for (const f of (fotos ?? []) as unknown as DocumentFoto[]) {
    if (!f.url) continue
    if (!f.regel_id) {
      algemeneFotos.push(f)
      continue
    }
    const lijst = fotosPerRegel.get(f.regel_id)
    if (lijst) lijst.push(f)
    else fotosPerRegel.set(f.regel_id, [f])
  }

  return {
    opname: {
      id: opname.id,
      opnamenummer: opname.opnamenummer,
      soort: opname.soort,
      status: opname.status,
      datum: opname.datum,
      adres: opname.adres_vrij ?? null,
      vhe: opname.vhe_aanduiding ?? null,
      opmerking: opname.opmerking ?? null,
      opnemer: volledigeNaam(opnemer.data as Parameters<typeof volledigeNaam>[0]) || null,
    },
    dossier: {
      id: opname.dossier_id,
      nummer: (dossier?.dossiernummer as string | null) ?? null,
      titel: (dossier?.titel as string | null) ?? null,
    },
    opdrachtgever: (relatie.data?.naam as string | null) ?? null,
    ruimtes: perRuimte((regels ?? []) as unknown as DocumentRegel[]),
    fotosPerRegel,
    algemeneFotos,
  }
}

/**
 * Haalt de foto's op die het document toont en verkleint ze tot JPEG. Een foto die niet laadt
 * ontbreekt in de map; het document slaat hem dan over in plaats van te mislukken.
 */
export async function laadDocumentFotos(urls: string[], maxPx: number): Promise<Map<string, Uint8Array>> {
  const uniek = Array.from(new Set(urls))
  const bytes = new Map<string, Uint8Array>()
  await mapMetLimiet(uniek, 6, async url => {
    const img = await haalAfbeelding(url, maxPx)
    if (img) bytes.set(url, img.bytes)
  })
  return bytes
}
