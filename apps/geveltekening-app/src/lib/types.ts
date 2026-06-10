export interface BagAddress {
  openbareruimteNaam: string
  huisnummer: number
  huisletter?: string
  huisnummertoevoeging?: string
  postcode: string
  woonplaatsNaam: string
  nummeraanduidingId: string
  pandId: string
  verblijfsobjectId?: string
  adresseerbaarObjectId?: string
}

export interface BagPand {
  pandId: string
  bouwjaar: number
  status: string
  geometrie: GeoJsonPolygon
  oppervlakte?: number
}

export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface FacadeOrientation {
  /** NESW; hoek in graden vanaf noord (0 = noord, 90 = oost, etc.) */
  compass: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  azimuthDegrees: number
}

export interface Facade {
  id: string
  label: string
  orientation: FacadeOrientation
  /** Horizontale lengte in meters, uit pand-footprint */
  widthMeters: number
  /** Geschatte gevelhoogte in meters, uit 3D BAG */
  estimatedHeightMeters: number
  /** Startpunt (lon, lat) en eindpunt van het gevelvlak in WGS84 */
  startPoint: [number, number]
  endPoint: [number, number]
}

export interface BuildingContext {
  address: BagAddress
  pand: BagPand
  facades: Facade[]
}

/** Elementsoorten op een geveltekening */
export type FacadeElementKind =
  | 'window'
  | 'door'
  | 'frame'
  | 'concrete-band'
  | 'lintel'
  | 'masonry'
  | 'fence'
  | 'canopy'
  | 'gutter'
  | 'roof-edge'
  | 'chimney'
  | 'other'

export type OpeningType =
  | 'draai-links'
  | 'draai-rechts'
  | 'draai-kiep-links'
  | 'draai-kiep-rechts'
  | 'kiep'
  | 'val'
  | 'vast'
  | 'schuif-links'
  | 'schuif-rechts'

export type MasonryPattern = 'halfsteens' | 'kettingverband' | 'wildverband'

/**
 * Element op een gevel. Posities zijn in METERS vanaf linksonder van het gevelvlak
 * (x naar rechts, y naar boven). Dit houdt de data schaalnauwkeurig en onafhankelijk
 * van weergave-resolutie.
 */
export interface FacadeElement {
  id: string
  kind: FacadeElementKind
  /** x-positie van linker-rand in meters vanaf linker kant van de gevel */
  x: number
  /** y-positie van onder-rand in meters vanaf maaiveld */
  y: number
  widthMeters: number
  heightMeters: number
  label?: string
  /** Vertrouwen (0..1) van Claude Vision, alleen voor auto-detected elementen */
  confidence?: number
  /** Draairichting / opening type (voor window/door/frame) */
  openingType?: OpeningType
  /** Naar buiten (solide V) of naar binnen (dashed V); default = false (naar binnen) */
  opensOutward?: boolean
  /** Aantal verticale stijlen (kozijnverdeling) */
  paneelverdelingH?: number
  /** Aantal horizontale roedes */
  paneelverdelingV?: number
  /** H.o.h. spijlen in mm (hekwerk) */
  railingSpacing?: number
  /** Metselwerkpatroon voor masonry-vlakken */
  masonryPattern?: MasonryPattern
  /** Element-nummer bv. "VG-R01" (auto of handmatig) */
  elementNumber?: string
}

export interface FacadeDrawing {
  facadeId: string
  /** Totale gevelbreedte in meters (referentiemaat) */
  widthMeters: number
  /** Totale gevelhoogte in meters (referentiemaat, maaiveld tot dakrand) */
  heightMeters: number
  elements: FacadeElement[]
  /** Optioneel: de bron-foto die gebruikt is voor analyse */
  sourceImageUrl?: string
}
