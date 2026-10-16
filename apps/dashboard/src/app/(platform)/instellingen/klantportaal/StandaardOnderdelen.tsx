'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardBody, CardHeader, Switch } from '@/components/ui'
import { PORTAAL_ONDERDELEN_ACTIEF } from '@/lib/portaal/onderdelen'
import type { PortaalStandaardOnderdelen } from '@/lib/portaal/contactpersoon'
import { setPortaalStandaardOnderdeel } from '@/lib/portaal/contactpersoon-actions'

/**
 * Welke onderdelen aangaan als een dossier automatisch voor het portaal wordt opengezet.
 *
 * Meerwerk staat er niet tussen: dat gaat al vanzelf aan zodra er meerwerk is. Bestanden en
 * foto's tonen alleen wat per stuk is vrijgegeven, dus die aanzetten deelt nog niets.
 */
export default function StandaardOnderdelen({ waarden }: { waarden: PortaalStandaardOnderdelen }) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  const [fout, setFout] = useState<string | null>(null)

  const onderdelen = PORTAAL_ONDERDELEN_ACTIEF.filter(
    (o): o is typeof o & { kolom: keyof PortaalStandaardOnderdelen } => o.kolom in waarden,
  )

  function wissel(kolom: keyof PortaalStandaardOnderdelen, aan: boolean) {
    setFout(null)
    start(async () => {
      const r = await setPortaalStandaardOnderdeel(kolom, aan)
      if (!r.ok) { setFout(r.error); return }
      router.refresh()
    })
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <span>Nieuwe dossiers</span>
        <span className="text-[11px] font-normal opacity-80">Standaard bij automatisch openzetten</span>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-[13px] leading-relaxed text-neutral-500">
          Heeft een contactpersoon toegang tot het portaal, dan gaat elk nieuw dossier van hem (of van
          zijn organisatie) vanzelf open met de onderdelen hieronder. Per dossier pas je het daarna
          aan op de tab Klantportaal; een dossier dat je daar dichtzet, blijft dicht.
        </p>
        {fout && (
          <div className="mb-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700">{fout}</div>
        )}
        <ul className="divide-y divide-neutral-100">
          {onderdelen.map(o => (
            <li key={o.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{o.label}</p>
                <p className="text-xs text-neutral-500">{o.uitleg}</p>
              </div>
              <Switch
                checked={waarden[o.kolom]}
                disabled={bezig}
                onCheckedChange={aan => wissel(o.kolom, aan)}
                aria-label={o.label}
              />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
