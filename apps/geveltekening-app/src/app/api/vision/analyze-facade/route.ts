import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { FacadeElement, FacadeElementKind, OpeningType } from '@/lib/types'
import { defaultsForKind } from '@/lib/facade-utils'

export const runtime = 'nodejs'
export const maxDuration = 60

interface AnalyzeRequestBody {
  /** Base64-encoded image (zonder data:URL prefix) OF publieke URL */
  image: string
  /** Referentiematen van de gevel */
  widthMeters: number
  heightMeters: number
  /** Vrije tekst context (bv "voorgevel van rijwoning, bouwjaar 1914") */
  context?: string
  /**
   * Geeft aan of de meegestuurde foto al orthogonaal rechtgetrokken is op
   * de 4 hoeken van de gevel. Zo ja: beeldranden = gevelranden exact.
   */
  rectified?: boolean
}

interface ClaudeElement {
  kind: FacadeElementKind
  x_pct: number
  y_pct: number
  w_pct: number
  h_pct: number
  label?: string
  confidence?: number
  openingType?: OpeningType
  opensOutward?: boolean
  paneelverdelingH?: number
  paneelverdelingV?: number
}

const SYSTEM_PROMPT = `Je bent een CAD-assistent die Nederlandse geveltekeningen maakt op basis van foto's.

Jouw taak: analyseer een foto van een gevel en identificeer alle zichtbare elementen.
Retourneer positie- en afmetinggegevens als PERCENTAGES van de totale gevel.

# BEELDCONTEXT (BELANGRIJK — LEES DIT EERST)
De gebruiker meldt per bericht of de foto al RECHTGETROKKEN is.

**Als RECHTGETROKKEN = true**
- De foto is orthogonaal geprojecteerd op de 4 hoeken van de gevel.
- De LINKERRAND van de afbeelding = de linkerrand van de gevel.
- De RECHTERRAND = de rechterrand van de gevel.
- De BOVENRAND = de bovenkant van de gevel (dakrand/goot).
- De ONDERRAND = de onderkant van de gevel (maaiveld/plint/begane-grondvloer).
- De aspect-ratio van de afbeelding komt overeen met widthMeters/heightMeters van de gevel.
- Er kunnen witte/egale randen in beeld zijn waar de rechttrekking over het originele beeld viel — negeer deze volledig, ze horen niet tot de gevel.
- Plaats elementen binnen [0..100] % van de beeld-randen; niet buiten.

**Als RECHTGETROKKEN = false**
- Foto is mogelijk scheef/perspectivisch; corrigeer mentaal voor perspectief.
- Beeld kan lucht, buurpanden, straat, voertuigen, vegetatie bevatten naast de gevel — negeer alles buiten de gevel.
- Leid zelf de contouren van de gevel af (dakrand boven, maaiveld onder, zijranden) en maak percentages relatief t.o.v. die gevel-bounding-box, NIET t.o.v. de hele foto.

# WERKWIJZE (verplicht, in deze volgorde)

## Stap 1 — ANKERS vastleggen
Identificeer eerst referentie-elementen met bekende standaardmaten. Gebruik deze om jouw schaalbegrip te kalibreren:
- Nederlandse voordeur: ~0,93 m breed × ~2,05-2,15 m hoog
- Verdiepingshoogte (vloer tot vloer): 2,80-3,20 m (oudbouw vaak 3,00-3,50 m, nieuwbouw 2,70-2,90 m)
- Baksteen-laag incl. voeg: ~0,07 m hoog → 10 lagen = ~0,70 m (handig om kleine maten af te passen)
- Goot zit meestal direct onder de dakrand; betonband loopt horizontaal door over (bijna) de hele breedte
- Raamhoogte zit typisch tussen 1,20 m en 1,80 m; borstweringshoogte (onderrand raam t.o.v. vloer) is meestal 0,85-1,00 m

Noteer in "anchors" WELK element je als schaal-anker gebruikt en WAAROM. Hierdoor kun je overige elementen relatief t.o.v. dit anker schatten.

## Stap 2 — SYMMETRIE & ROOSTER detecteren
Nederlandse gevels zijn vaak:
- Symmetrisch t.o.v. verticale middenas (spiegel links/rechts)
- Op een regelmatig rooster geplaatst: ramen boven elkaar met gelijke breedte, dezelfde borstweringshoogte per verdieping
Benoem expliciet of er een rooster is. Als twee ramen duidelijk op dezelfde verdieping staan, MOETEN ze dezelfde hoogte en dezelfde y_pct krijgen. Als ramen boven elkaar staan, MOETEN ze dezelfde x_pct en w_pct hebben.

## Stap 3 — PLAATSEN relatief aan anker + rooster
Pas nu alle andere elementen in t.o.v. het anker en het rooster. Rond maten af op hele centimeters (2 decimalen in percentage-waarden is ruim voldoende).

# ELEMENTSOORTEN (gebruik exact deze keys)
- "window": ramen
- "door": deuren en deur-kozijnen
- "frame": losse kozijnen zonder raam/deur (zeldzaam)
- "concrete-band": betonband, speklaag, rollaag, horizontale sierband (volledige breedte meestal)
- "lintel": latei boven een enkel kozijn (smal, alleen boven een raam/deur)
- "masonry": metselwerk-vlak (groot deel van de gevel, baksteen)
- "fence": hekwerk / balkonhek / terrashek / trapleuning met verticale spijlen
- "canopy": luifel, overstek, afdak boven deur of kozijn
- "gutter": goot, horizontaal onderaan dakvlak
- "roof-edge": dakrand (bovenkant van de gevel)
- "chimney": schoorsteen (indien zichtbaar)
- "other": overig (geef dan label mee)

# DRAAIRICHTING (alleen voor window, door, frame)
Benoem per opening een "openingType" (indien zichtbaar of redelijk in te schatten):
- "vast" = niet te openen (zeer veel nieuwbouw heeft één vast raam + één draaideel)
- "draai-links" / "draai-rechts" = scharnieren aan die zijde, draait open rond verticale as
- "draai-kiep-links" / "draai-kiep-rechts" = draait open + kan ook kiepen (standaard voor NL nieuwbouw)
- "kiep" = klein bovenraam dat alleen kantelt (boven grotere vaste delen)
- "val" = valraam (scharnieren bovenaan, zeldzaam)
- "schuif-links" / "schuif-rechts" = schuifraam
Zet "opensOutward": false tenzij je duidelijk ziet dat het naar buiten opent (bv. Engelse schuiframen zijn schuif; winkelpuien zijn soms naar-buiten draaiend).

# PANEELVERDELING
Geef voor kozijnen indien zichtbaar:
- "paneelverdelingH": aantal verticale kolommen (1 = één vlak, 2 = tweedelig, etc.)
- "paneelverdelingV": aantal horizontale rijen (met roede)

# DEFAULTS bij twijfel
- Ramen in woningen: openingType = "draai-kiep-links", opensOutward = false
- Deuren: openingType = "draai-rechts", opensOutward = false
- Vaste bovenlichten / bovenraam smal: openingType = "vast" of "kiep"

# COORDINATENSYSTEEM (BEELD-NATIEF, y-as naar beneden)
(0%, 0%) = LINKSBOVEN van de gevel; (100%, 100%) = RECHTSONDER.
- x_pct = linkerrand van element, als % van gevelbreedte, 0 = linkerrand beeld.
- y_pct = BOVENRAND van element, als % van gevelhoogte, 0 = BOVENRAND beeld (dakrand), 100 = onderkant (maaiveld).
- w_pct, h_pct = afmetingen als % van totale gevelbreedte/hoogte.
- Sanity-check: voor elk element moeten 0 ≤ x_pct ≤ 100, 0 ≤ y_pct ≤ 100, x_pct + w_pct ≤ 100, y_pct + h_pct ≤ 100.
- Een deur die op het maaiveld staat heeft y_pct + h_pct ≈ 100 (onderrand raakt onderrand beeld).
- Een dakrand/goot zit dicht tegen y_pct = 0 aan.

# REGELS
- Negeer vegetatie, voertuigen, personen, bewegwijzering, straatmeubilair die NIET aan de gevel zitten.
- Bij twijfel: skip het (liever te weinig dan te veel).
- Geef per element een confidence score (0..1).
- Elementen mogen elkaar NIET overlappen (betonband mag wel door ramen heen lijken te lopen, maar knip dan de band op in segmenten links en rechts van het raam).
- Accuraatheid > volledigheid.

# OUTPUT
Retourneer ALLEEN een JSON-object (geen markdown, geen code fences):
{
  "anchors": "Gebruikte als anker: voordeur (~2,10 m hoog) linksonder; verdiepingshoogte afgelezen op ~3,10 m door bakstenen te tellen.",
  "grid": "Symmetrische voorgevel, 2 verdiepingen, 3 raam-assen per verdieping met gelijke breedte.",
  "elements": [
    { "kind": "door", "x_pct": 45.0, "y_pct": 78.0, "w_pct": 6.0, "h_pct": 22.0, "openingType": "draai-rechts", "opensOutward": false, "confidence": 0.95 },
    { "kind": "window", "x_pct": 12.0, "y_pct": 71.0, "w_pct": 14.0, "h_pct": 17.0, "openingType": "draai-kiep-links", "opensOutward": false, "paneelverdelingH": 2, "paneelverdelingV": 1, "confidence": 0.9 },
    { "kind": "roof-edge", "x_pct": 0.0, "y_pct": 0.0, "w_pct": 100.0, "h_pct": 2.0, "confidence": 0.95 }
  ],
  "notes": "korte observatie, bv 'bouwjaar rond 1920, baksteen, schilderwerk voor kozijnen zichtbaar'"
}`

function isLikelyUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY niet ingesteld' },
      { status: 503 }
    )
  }

  let body: AnalyzeRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'ongeldige JSON body' }, { status: 400 })
  }

  if (!body.image || !body.widthMeters || !body.heightMeters) {
    return NextResponse.json(
      { error: 'image, widthMeters en heightMeters zijn verplicht' },
      { status: 400 }
    )
  }

  const anthropic = new Anthropic({ apiKey })

  const imageContent = isLikelyUrl(body.image)
    ? ({
        type: 'image' as const,
        source: { type: 'url' as const, url: body.image },
      })
    : ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: (body.image.startsWith('/9j/')
            ? 'image/jpeg'
            : 'image/png') as 'image/jpeg' | 'image/png',
          data: body.image,
        },
      })

  const rectifiedLine = body.rectified
    ? 'RECHTGETROKKEN = true. De beeldranden vallen exact samen met de gevelranden (links/rechts/boven/onder). Plaats alle percentages relatief aan de beeldranden.'
    : 'RECHTGETROKKEN = false. De foto bevat mogelijk lucht, buurpanden, straat of vegetatie naast de gevel. Identificeer zelf de gevel-bounding-box en maak percentages relatief aan die box, niet aan de hele foto.'

  const userText = `Analyseer deze gevelfoto.
Gevel is ${body.widthMeters.toFixed(2)} m breed en ${body.heightMeters.toFixed(2)} m hoog (aspect-ratio ${(body.widthMeters / body.heightMeters).toFixed(2)}).
${rectifiedLine}
Gebruik y_pct = 0 voor BOVENKANT beeld, y_pct = 100 voor onderkant.${
    body.context ? `\nContext: ${body.context}` : ''
  }`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [imageContent, { type: 'text', text: userText }],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Geen tekst in Claude response' }, { status: 502 })
    }

    let parsed: { elements: ClaudeElement[]; notes?: string; anchors?: string; grid?: string }
    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      const match = textBlock.text.match(/\{[\s\S]*\}/)
      if (!match) {
        return NextResponse.json(
          { error: 'Kon JSON niet parsen uit Claude response', raw: textBlock.text },
          { status: 502 }
        )
      }
      parsed = JSON.parse(match[0])
    }

    const elements: FacadeElement[] = (parsed.elements ?? []).map((el, i) => {
      const defaults = defaultsForKind(el.kind)
      // Claude geeft y_pct als BOVENRAND vanaf de top (beeld-natief).
      // Canvas werkt met y=0 onderaan + y=onderrand element, dus flippen.
      const wMeters = (el.w_pct / 100) * body.widthMeters
      const hMeters = (el.h_pct / 100) * body.heightMeters
      const xMeters = (el.x_pct / 100) * body.widthMeters
      const topMeters = (el.y_pct / 100) * body.heightMeters
      const yFromBottom = Math.max(0, body.heightMeters - topMeters - hMeters)
      return {
        id: `auto-${Date.now()}-${i}`,
        kind: el.kind,
        x: xMeters,
        y: yFromBottom,
        widthMeters: wMeters,
        heightMeters: hMeters,
        label: el.label,
        confidence: el.confidence,
        openingType: el.openingType ?? defaults.openingType,
        opensOutward: el.opensOutward ?? defaults.opensOutward,
        paneelverdelingH: el.paneelverdelingH ?? defaults.paneelverdelingH,
        paneelverdelingV: el.paneelverdelingV ?? defaults.paneelverdelingV,
        railingSpacing: defaults.railingSpacing,
        masonryPattern: defaults.masonryPattern,
      }
    })

    return NextResponse.json({
      elements,
      notes: parsed.notes,
      anchors: parsed.anchors,
      grid: parsed.grid,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende Claude-fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
