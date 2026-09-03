'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { setRegieOpslagPct } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { Button, Input } from '@/components/ui'

export default function RegieOpslagBeheer({ initial }: { initial: number }) {
  const router = useRouter()
  const [pct, setPct] = useState<string>(String(initial))
  const [busy, setBusy] = useState(false)

  async function opslaan() {
    const n = parseFloat(pct.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { toast.error('Vul een percentage van 0 of hoger in'); return }
    setBusy(true)
    const r = await setRegieOpslagPct(n)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Opslag opgeslagen')
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
        Opslag op <strong>geboekte kosten</strong> (materiaal, onderaanneming, inkoop) bij regiewerk en bij
        het verrekenen van een stelpost die op geboekte kosten afrekent. Uren rekenen niet met deze opslag
        maar met het afgesproken verkooptarief per uursoort. Een handmatig aangepaste regel, en een stelpost
        met een eigen opslagpercentage, gaan altijd vóór deze standaard.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Input
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          inputMode="decimal"
          style={{ maxWidth: 110 }}
          placeholder="25"
          aria-label="Opslagpercentage op geboekte kosten"
        />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--fg-muted)' }}>%</span>
        <Button onClick={opslaan} disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</Button>
      </div>
    </div>
  )
}
