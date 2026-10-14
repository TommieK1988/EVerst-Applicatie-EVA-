'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@everts/database/client'

const PUBLIEK_PREFIX = '/storage/v1/object/public/medewerker-bestanden/'

/**
 * Het pad binnen de bucket `medewerker-bestanden` als `url` daarnaar wijst, anders `null`.
 *
 * De uploads (foto, handtekening, bestanden) slaan een `getPublicUrl()` op, maar de bucket is
 * privé: medewerkerbestanden kunnen contracten of ID-kopieën zijn. Die publieke link geeft
 * dus altijd een 400 — een kapotte afbeelding en een "Onbekende fout" in het foutenlog.
 */
export function medewerkerBestandPad(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(PUBLIEK_PREFIX)
  return i < 0 ? null : decodeURIComponent(url.slice(i + PUBLIEK_PREFIX.length).split('?')[0])
}

/**
 * Toonbare URL voor een opgeslagen medewerker-bestand: een ondertekende link (1 uur) als het
 * in de privé-bucket staat, anders de URL zelf. Tot de link er is: `null`, zodat er geen
 * kapotte afbeelding flitst.
 */
export function useMedewerkerBestandUrl(url: string | null | undefined): string | null {
  const pad = medewerkerBestandPad(url)
  const [getekend, setGetekend] = useState<{ pad: string; url: string } | null>(null)

  useEffect(() => {
    if (!pad) return
    let actief = true
    createClient().storage.from('medewerker-bestanden').createSignedUrl(pad, 3600)
      .then(({ data }) => { if (actief && data?.signedUrl) setGetekend({ pad, url: data.signedUrl }) })
    return () => { actief = false }
  }, [pad])

  if (!pad) return url ?? null
  return getekend?.pad === pad ? getekend.url : null
}

/**
 * Opent een opgeslagen medewerker-bestand in een nieuw tabblad. Het tabblad gaat eerst open
 * en krijgt daarna pas de ondertekende link: een `window.open` ná een `await` houdt een
 * popupblokker tegen.
 */
export async function openMedewerkerBestand(url: string): Promise<void> {
  const pad = medewerkerBestandPad(url)
  if (!pad) { window.open(url, '_blank', 'noopener'); return }
  const tab = window.open('', '_blank')
  const { data } = await createClient().storage.from('medewerker-bestanden').createSignedUrl(pad, 3600)
  if (tab && data?.signedUrl) tab.location.href = data.signedUrl
  else tab?.close()
}
