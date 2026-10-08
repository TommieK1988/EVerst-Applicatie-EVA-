'use client'

/**
 * De laatste stap van een opdracht op een bon: het concept staat in Bouw7, nu de mail naar de
 * partij. Los van het bestelvenster omdat een opdracht die op akkoord wachtte hier ook landt,
 * vanaf de bon zelf (`BonOpenOpdrachten`).
 *
 * Bij het openen haalt hij het mailconcept op; mislukt dat, dan blijven de velden leeg en vul je
 * ze zelf in.
 */

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import type { WerkbegrotingBestelling } from '@/lib/everts-calc/types'
import { getBestellingMailConcept, verstuurBestelling } from '@/app/(platform)/everts-calc/actions/bestellingen'
import MailFotoBijlagen, { alsBijlagen, type MailFoto } from '@/components/mail/MailFotoBijlagen'

const veld = 'w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm ' +
  'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
const kop = 'mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500'

export default function OpdrachtMailVenster({
  dossierId, bestelling, titel, laterLabel = 'Later versturen', onLater, onVerstuurd,
}: {
  dossierId: string
  bestelling: WerkbegrotingBestelling
  titel: string
  laterLabel?: string
  onLater: () => void
  onVerstuurd: () => void
}) {
  const [mail, setMail] = useState({ to: '', cc: '', onderwerp: '', bericht: '' })
  const [fotos, setFotos] = useState<MailFoto[]>([])
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    let actief = true
    getBestellingMailConcept(dossierId, bestelling.id, bestelling.sjabloon_id ?? null)
      .then(c => { if (actief) setMail({ to: c.to, cc: '', onderwerp: c.onderwerp, bericht: c.bericht }) })
      .catch(() => { /* lege velden; zelf invullen */ })
    return () => { actief = false }
  }, [dossierId, bestelling.id, bestelling.sjabloon_id])

  async function verstuur() {
    if (!mail.to.trim()) { toast.error('Vul het e-mailadres van de partij in.'); return }
    setBezig(true)
    try {
      const res = await verstuurBestelling(dossierId, bestelling.id, {
        ...mail, sjabloonId: bestelling.sjabloon_id ?? null, fotos: alsBijlagen(fotos),
      })
      if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
      toast.success(res.bonWaarschuwing
        ? `Verstuurd, maar de leverbon niet aangemaakt: ${res.bonWaarschuwing}`
        : 'Verstuurd')
      fotos.forEach(f => URL.revokeObjectURL(f.url))
      setFotos([])
      onVerstuurd()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={bezig ? undefined : onLater}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl border border-neutral-200 bg-white p-5 shadow-lg
                   dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">{titel}</h2>
        <p className="mb-4 text-[11.5px] text-neutral-500">
          {`${bestelling.bouw7_nummer ?? 'De opdracht'} staat als concept in Bouw7.`}
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label>
            <span className={kop}>Aan</span>
            <input value={mail.to} onChange={e => setMail(m => ({ ...m, to: e.target.value }))} className={veld} />
          </label>
          <label>
            <span className={kop}>Cc</span>
            <input value={mail.cc} onChange={e => setMail(m => ({ ...m, cc: e.target.value }))} className={veld} />
          </label>
        </div>
        <label className="mb-3 block">
          <span className={kop}>Onderwerp</span>
          <input value={mail.onderwerp} onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))} className={veld} />
        </label>
        <label className="mb-4 block">
          <span className={kop}>Bericht</span>
          <textarea
            value={mail.bericht} onChange={e => setMail(m => ({ ...m, bericht: e.target.value }))}
            rows={6} className={veld}
          />
        </label>
        <div className="mb-4">
          <MailFotoBijlagen fotos={fotos} onChange={setFotos} disabled={bezig} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onLater} disabled={bezig}>{laterLabel}</Button>
          <Button variant="primary" onClick={verstuur} loading={bezig} disabled={bezig}>Versturen</Button>
        </div>
      </div>
    </div>
  )
}
