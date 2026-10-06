'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { AMBER, ROOD, label, secundaireKnop } from '@/components/mobiel/oplevering/stijl'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'

/**
 * Eén fotovak bij een houtrotreparatie (voor, na, of de foto van een handmatige regel).
 *
 * Toont wat er straks bewaard wordt: een net gekozen foto, anders de huidige. Daaronder
 * altijd twee aparte knoppen, camera en galerij — `capture` dwingt de camera af, en zonder
 * `capture` bieden sommige Android-telefoons alléén de galerij aan. Zelfde patroon als
 * materieel en de kwaliteitsronde.
 *
 * Wijzigingen gaan pas door bij "Opslaan" van de hele reparatie. Dat staat er daarom ook
 * bij zodra er iets veranderd is: een foto die verdwijnt maar bij terugkomen weer blijkt
 * te bestaan, lees je anders als "verwijderen werkt niet".
 */
export default function HoutrotFotoVak({ titel, huidigeUrl, nieuw, gewijzigd, onKies, onVerwijder }: {
  titel: string
  /** Publieke URL van de opgeslagen foto, als die er (nog) is. */
  huidigeUrl?: string
  /** Net gekozen, nog niet geüploade foto. */
  nieuw: File | null
  /** Is er t.o.v. de opgeslagen stand iets veranderd (nieuw gekozen of weggehaald)? */
  gewijzigd: boolean
  onKies: (bestand: File) => void
  onVerwijder: () => void
}) {
  const t = useTranslations('houtrot')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)

  const [nieuwUrl, setNieuwUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!nieuw) { setNieuwUrl(null); return }
    const url = URL.createObjectURL(nieuw)
    setNieuwUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [nieuw])

  const toon = nieuwUrl ?? huidigeUrl
  // Meteen verkleinen (en HEIC → JPEG): anders toont de voorvertoning op Android een kapot
  // plaatje voor een galerijfoto. Bij opslaan is het daarna een kleine JPEG die niets meer kost.
  const gekozen = async (e: ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0]
    e.target.value = '' // dezelfde foto nog eens kiezen moet ook een change geven
    if (bestand) onKies(await verkleinFoto(bestand))
  }

  return (
    <div>
      <span style={label}>{titel}</span>
      {toon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={toon} alt={titel} style={{
          display: 'block', width: '100%', maxHeight: '45vh', objectFit: 'contain',
          background: '#0e1114', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 8,
        }} />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => cameraRef.current?.click()}
          style={{ ...secundaireKnop, flex: '1 1 30%', whiteSpace: 'normal' }}>
          {toon ? t('fotoVak.nieuweFoto') : t('fotoVak.fotoMaken')}
        </button>
        <button type="button" onClick={() => galerijRef.current?.click()}
          style={{ ...secundaireKnop, flex: '1 1 30%', whiteSpace: 'normal' }}>
          {t('fotoVak.uitGalerij')}
        </button>
        {toon && (
          <button type="button" onClick={onVerwijder}
            style={{ ...secundaireKnop, flex: '1 1 30%', whiteSpace: 'normal', color: ROOD }}>
            {t('fotoVak.verwijderen')}
          </button>
        )}
      </div>
      {gewijzigd && (
        <div style={{ fontSize: 12.5, color: AMBER, marginTop: 6 }}>{t('fotoVak.pasNaOpslaan')}</div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={gekozen} />
      <input ref={galerijRef} type="file" accept="image/*" hidden onChange={gekozen} />
    </div>
  )
}
