'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  setGoedkeuringDrempelOfferte, setGoedkeuringDrempelInkoop,
} from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { Button, Input } from '@/components/ui'

/**
 * Eén drempelbedrag instellen. Twee soorten, zelfde vorm: vanaf welk bedrag moet er een
 * tweede paar ogen naar kijken — bij een offerte naar buiten, bij een inkoop naar binnen.
 */
export type DrempelSoort = 'offerte' | 'inkoop'

const UITLEG: Record<DrempelSoort, React.ReactNode> = {
  offerte: (
    <>
      Offertes met categorie <strong>Dagelijks onderhoud</strong> of <strong>Mutatie</strong> vereisen pas
      controller-goedkeuring vanaf dit bedrag (excl. btw). Alle overige categorieën vereisen altijd goedkeuring.
    </>
  ),
  inkoop: (
    <>
      Op een <strong>servicedeskbon</strong> hoeven de werkbegrotingregels achter een inkooporder of
      onderaannemersopdracht pas geaccordeerd te zijn vanaf dit bedrag (excl. btw). Zo kan een storing
      dezelfde dag verholpen worden. Op alle andere dossiers is accordering altijd verplicht.
    </>
  ),
}

export default function GoedkeuringDrempelBeheer({
  initial, soort = 'offerte',
}: { initial: number; soort?: DrempelSoort }) {
  const router = useRouter()
  const [bedrag, setBedrag] = useState<string>(String(initial))
  const [busy, setBusy] = useState(false)

  async function opslaan() {
    const n = parseFloat(bedrag.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { toast.error('Vul een geldig bedrag in'); return }
    setBusy(true)
    const r = soort === 'inkoop'
      ? await setGoedkeuringDrempelInkoop(n)
      : await setGoedkeuringDrempelOfferte(n)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Drempelbedrag opgeslagen')
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
        {UITLEG[soort]}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--fg-muted)' }}>€</span>
        <Input
          value={bedrag}
          onChange={(e) => setBedrag(e.target.value)}
          inputMode="decimal"
          style={{ maxWidth: 160 }}
          placeholder="1000"
        />
        <Button onClick={opslaan} disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</Button>
      </div>
    </div>
  )
}
