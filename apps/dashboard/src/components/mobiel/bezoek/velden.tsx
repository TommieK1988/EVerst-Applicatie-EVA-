'use client'

/**
 * Gedeelde bouwstenen van de bezoekdoorloop.
 *
 * Uit `BezoekDoorloop.tsx` gelicht toen het bezoek per discipline werd opgebouwd: dezelfde
 * kop, hetzelfde tekstveld en dezelfde fotostrook worden nu op drie plekken gebruikt (het
 * bezoek zelf, een punt, de afronding). Eén kopie, geen drie.
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { GRIJS, RAND, veld, label, secundaireKnop } from '@/components/mobiel/kwaliteit/stijl'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'

export function SectieKop({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 12, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
      letterSpacing: 0.4, margin: '0 0 8px',
    }}>{children}</h2>
  )
}

/** Tekstveld dat bij verlaten opslaat — geen opslaanknop per veld op een telefoon. */
export function TekstVeld({
  titel, waarde, opslaan, plaatshouder, regels = 1, lezen = false, laatste = false,
}: {
  titel: string
  waarde: string
  opslaan: (v: string) => void | Promise<unknown>
  plaatshouder?: string
  regels?: number
  lezen?: boolean
  laatste?: boolean
}) {
  const [lokaal, setLokaal] = useState(waarde)
  const gedeeld = {
    style: { ...veld, ...(regels > 1 ? { minHeight: regels * 26 } : {}) },
    value: lokaal,
    placeholder: plaatshouder,
    disabled: lezen,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLokaal(e.target.value),
    onBlur: () => { if (lokaal !== waarde) opslaan(lokaal) },
  }
  return (
    <div style={{ marginBottom: laatste ? 0 : 12 }}>
      <span style={label}>{titel}</span>
      {regels > 1 ? <textarea rows={regels} {...gedeeld} /> : <input type="text" {...gedeeld} />}
    </div>
  )
}

/**
 * Uploadt een reeks foto's één voor één, elk eerst verkleind.
 *
 * Eén request per foto en niet alles in één FormData: tien galerijfoto's van 4 MB passen
 * nooit onder de body-limiet van de server-action, en één mislukte foto hoort de andere negen
 * niet mee te nemen. Geeft terug hoeveel er mislukten, plus de eerste foutmelding.
 */
export async function uploadFotoReeks(
  files: File[],
  uploaden: (file: File) => Promise<{ ok: boolean; error?: string }>,
  voortgang?: (klaar: number) => void,
): Promise<{ mislukt: number; fout?: string }> {
  let mislukt = 0
  let fout: string | undefined
  for (let i = 0; i < files.length; i++) {
    try {
      const r = await uploaden(await verkleinFoto(files[i]))
      if (!r.ok) { mislukt++; fout ??= r.error }
    } catch (e) {
      mislukt++; fout ??= e instanceof Error ? e.message : String(e)
    }
    voortgang?.(i + 1)
  }
  return { mislukt, fout }
}

/**
 * Twee knoppen naast elkaar: camera en galerij.
 *
 * Twee aparte inputs omdat `capture` alles-of-niets is: mét `capture` opent iOS/Android direct
 * de camera en is de galerij onbereikbaar, zónder krijg je een keuzemenu dat voor "snel even
 * een foto" een tik te veel is. De galerij-input staat `multiple` toe.
 */
export function FotoKiesKnoppen({
  onKies, bezig = false, bezigTekst,
}: {
  onKies: (files: File[]) => void
  bezig?: boolean
  bezigTekst?: string
}) {
  const t = useTranslations('bezoek')
  const knopStijl: React.CSSProperties = {
    ...secundaireKnop, flex: 1, minWidth: 0, textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    ...(bezig ? { opacity: 0.6, pointerEvents: 'none' } : {}),
  }
  const kies = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) onKies(files)
  }

  if (bezig) {
    return <div style={{ ...secundaireKnop, textAlign: 'center', opacity: 0.7 }}>{bezigTekst ?? t('bezig')}</div>
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <label style={knopStijl}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {t('foto.maken')}
        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
               onChange={kies} />
      </label>
      <label style={knopStijl}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        {t('foto.uitGalerij')}
        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
               onChange={kies} />
      </label>
    </div>
  )
}

/** Vierkante fototegel met optioneel een verwijderkruisje. */
export function FotoTegel({ url, onVerwijder }: { url: string; onVerwijder?: () => void }) {
  const t = useTranslations('bezoek')
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={{
        width: 92, height: 92, objectFit: 'cover', borderRadius: 10,
        border: `1px solid ${RAND}`,
      }} />
      {onVerwijder && (
        <button
          type="button"
          onClick={onVerwijder}
          style={{
            position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
            border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14,
            lineHeight: '24px', cursor: 'pointer', padding: 0,
          }}
          aria-label={t('foto.verwijderen')}
        >×</button>
      )}
    </div>
  )
}

/** Horizontale strook tegels. flexShrink 0 op de tegels: anders perst overflow-x ze plat. */
export function TegelRij({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
      {children}
    </div>
  )
}

/**
 * Fotostrook.
 *
 * Generiek gemaakt toen een punt zijn eigen foto's kreeg: de strook weet niet meer waar de
 * foto aan hangt, hij krijgt een upload- en een verwijderfunctie mee. Zo bedient hij zowel
 * de foto's bij een punt als die bij het bezoek als geheel.
 */
export function FotoStrip({
  fotos, lezen, uploaden, verwijderen, naWijziging, titel,
}: {
  fotos: { id: string; url: string }[]
  lezen: boolean
  uploaden: (file: File) => Promise<{ ok: boolean; error?: string }>
  verwijderen: (id: string) => Promise<{ ok: boolean; error?: string }>
  naWijziging: () => void
  /** Leeg (`""`) = geen titel; weggelaten = "Foto's". */
  titel?: string
}) {
  const t = useTranslations('bezoek')
  const kop = titel ?? t('foto.titel')
  const [bezig, setBezig] = useState<{ klaar: number; totaal: number } | null>(null)

  return (
    <div style={{ marginTop: 10 }}>
      {kop && <span style={label}>{kop}</span>}
      {fotos.length > 0 && (
        <TegelRij>
          {fotos.map(f => (
            <FotoTegel
              key={f.id}
              url={f.url}
              onVerwijder={lezen ? undefined : async () => {
                const r = await verwijderen(f.id)
                if (!r.ok) { toast.error(r.error ?? t('foto.verwijderenMislukt')); return }
                naWijziging()
              }}
            />
          ))}
        </TegelRij>
      )}
      {!lezen && (
        <FotoKiesKnoppen
          bezig={bezig !== null}
          bezigTekst={bezig && bezig.totaal > 1
            ? t('foto.uploadenVoortgang', { nummer: Math.min(bezig.klaar + 1, bezig.totaal), totaal: bezig.totaal })
            : t('foto.uploaden')}
          onKies={async files => {
            setBezig({ klaar: 0, totaal: files.length })
            const { mislukt, fout } = await uploadFotoReeks(
              files, uploaden, klaar => setBezig({ klaar, totaal: files.length }),
            )
            setBezig(null)
            if (mislukt > 0) {
              toast.error(mislukt === files.length
                ? (fout ?? t('foto.uploadenMislukt'))
                : fout
                  ? t('foto.deelsMisluktMetFout', { mislukt, totaal: files.length, fout })
                  : t('foto.deelsMislukt', { mislukt, totaal: files.length }))
            }
            if (mislukt < files.length) naWijziging()
          }}
        />
      )}
    </div>
  )
}
