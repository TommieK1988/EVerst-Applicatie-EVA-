/**
 * 3D BAG — open dataset van TU Delft met 3D-modellen van alle Nederlandse gebouwen.
 * Per pand: maaiveldhoogte, gooth. (70e percentiel), dak max, nok.
 * Docs: https://docs.3dbag.nl/en/
 * Endpoint: https://data.3dbag.nl/api/BAG3D/wfs
 *
 * Alle hoogtes zijn in meters NAP (Nieuw Amsterdams Peil).
 */

const BAG3D_WFS = 'https://data.3dbag.nl/api/BAG3D/wfs'

export interface Bag3dHeights {
  groundLevelNap: number
  /** Goothoogte (70e percentiel van dakhoogtes — benadering van goot) in m NAP */
  gutterHeightNap: number
  /** Maximale dakhoogte (dakrand/nok) in m NAP */
  roofMaxNap: number
  /** Nokhoogte in m NAP */
  ridgeNap: number
  /** Berekende goothoogte boven maaiveld (m) */
  gutterHeightAboveGround: number
  /** Berekende totale hoogte boven maaiveld (m) */
  totalHeightAboveGround: number
  /** Type dak volgens 3D BAG (horizontaal, schilddak, etc.) */
  roofType?: string
}

export async function getHeightsByPandId(pandId: string): Promise<Bag3dHeights | null> {
  const url = new URL(BAG3D_WFS)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeNames', 'BAG3D:lod12')
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('count', '1')
  url.searchParams.set('cql_filter', `identificatie='NL.IMBAG.Pand.${pandId}'`)

  let res: Response
  try {
    res = await fetch(url.toString(), { next: { revalidate: 86400 } })
  } catch {
    return null
  }
  if (!res.ok) return null

  const data = await res.json()
  const props = data?.features?.[0]?.properties
  if (!props) return null

  const ground = Number(props.b3_h_maaiveld ?? 0)
  const gutter = Number(props.b3_h_70p ?? 0)
  const roofMax = Number(props.b3_h_max ?? 0)
  const ridge = Number(props.b3_h_nok ?? roofMax)

  return {
    groundLevelNap: ground,
    gutterHeightNap: gutter,
    roofMaxNap: roofMax,
    ridgeNap: ridge,
    gutterHeightAboveGround: Math.max(0, gutter - ground),
    totalHeightAboveGround: Math.max(0, roofMax - ground),
    roofType: props.b3_dak_type,
  }
}
