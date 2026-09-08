import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { gatLabel, type RitDekking } from '@/lib/wagenpark/rit-dekking'

/**
 * Waarschuwing bij werkdagen zonder ritregistratie.
 *
 * Het punt is het onderscheid tussen "niets aan de hand" en "niets gemeten".
 * Alles wat uit ritten volgt — werktijden, kilometers, compliance — leest over
 * een gat heen als een schone periode, en dat is precies wat je níet wilt
 * concluderen in een gesprek met een medewerker.
 */
export default function RitDekkingWaarschuwing({
  dekking,
  /** Kortere tekst voor in een blok dat al over ritten gaat. */
  compact = false,
}: {
  dekking: RitDekking
  compact?: boolean
}) {
  if (dekking.dagenZonderData === 0) return null

  const reeksen = dekking.gaten.map(gatLabel).join(', ')
  const meervoud = dekking.dagenZonderData === 1 ? 'werkdag' : 'werkdagen'

  if (compact) {
    return (
      <p className="mb-3 text-xs text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
        Let op: op {dekking.dagenZonderData} {meervoud} in deze periode staat van niemand een rit
        geregistreerd ({reeksen}). Die dagen tellen hieronder als "geen afwijking", maar er is
        niets gemeten.
      </p>
    )
  }

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
        <div>
          <strong>
            Op {dekking.dagenZonderData} {meervoud} in deze periode staat geen enkele rit
            geregistreerd.
          </strong>{' '}
          <span className="text-amber-800">{reeksen}.</span>
          <p className="mt-1 text-amber-800">
            Dat kan een bouwvak of feestdag zijn, maar meestal betekent het dat de rittensync die
            dagen niet gelopen heeft. Alle cijfers hieronder die op ritten rekenen — kilometers,
            werktijden, bevindingen — zijn over die dagen leeg, en dat ziet eruit als "niets aan de
            hand". Ontbrekende dagen haal je terug met de{' '}
            <Link href="/wagenpark/ritten/import" className="underline hover:no-underline">
              Excel-import
            </Link>{' '}
            van een ULU-rittenexport; via de API zijn ze na ongeveer een week niet meer op te halen.
          </p>
        </div>
      </div>
    </div>
  )
}
