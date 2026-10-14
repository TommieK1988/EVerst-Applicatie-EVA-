'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { uploadDocument } from '@/app/(platform)/materieelbeheer/bestand-actions'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { RAND, ROOD, secundaireKnop } from './stijl'

/**
 * Hoofdfoto op het mobiele paspoort, met "Foto maken" / "Kiezen" voor wie mag
 * schrijven.
 *
 * Een nieuwe foto wordt altijd de hoofdfoto (`hoofdfoto=1`): je maakt hem omdat
 * er nog geen is of omdat de oude niets laat zien. De oude blijft bij de
 * documenten op de desktop staan.
 *
 * Twee losse inputs, net als in het nieuw-formulier: `capture` dwingt de camera
 * af, en zonder tweede input kun je geen bestaande foto kiezen.
 */
export default function PaspoortFoto({
  objectId,
  fotoUrl,
  magSchrijven,
}: {
  objectId: string
  fotoUrl: string | null
  magSchrijven: boolean
}) {
  const t = useTranslations('materieel')
  const router = useRouter()
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const bibliotheekRef = React.useRef<HTMLInputElement>(null)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  async function upload(bestand: File | undefined) {
    if (!bestand) return
    setBezig(true); setFout(null)
    const fd = new FormData()
    fd.append('bestand', await verkleinFoto(bestand))
    fd.append('type', 'foto')
    fd.append('hoofdfoto', '1')
    const res = await uploadDocument(objectId, fd)
    if (res.ok) router.refresh()
    else setFout(t('paspoort.fotoMislukt', { fout: res.error }))
    setBezig(false)
  }

  if (!fotoUrl && !magSchrijven) return null

  return (
    <div style={{ marginBottom: 12 }}>
      {fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoUrl}
          alt=""
          style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 14, border: `1px solid ${RAND}`, marginBottom: magSchrijven ? 8 : 0, opacity: bezig ? 0.5 : 1 }}
        />
      )}
      {magSchrijven && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button" disabled={bezig}
              onClick={() => cameraRef.current?.click()}
              style={{ ...secundaireKnop, flex: 1, opacity: bezig ? 0.6 : 1 }}
            >
              {bezig ? t('paspoort.fotoBezig') : fotoUrl ? t('paspoort.nieuweFoto') : t('nieuw.fotoMaken')}
            </button>
            <button
              type="button" disabled={bezig}
              onClick={() => bibliotheekRef.current?.click()}
              style={{ ...secundaireKnop, flex: 1, opacity: bezig ? 0.6 : 1 }}
            >
              {t('nieuw.fotoKiezen')}
            </button>
          </div>
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }}
          />
          <input
            ref={bibliotheekRef} type="file" accept="image/*" hidden
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }}
          />
          {fout && <div style={{ color: ROOD, fontSize: 14, lineHeight: 1.45, marginTop: 8 }}>{fout}</div>}
        </>
      )}
    </div>
  )
}
