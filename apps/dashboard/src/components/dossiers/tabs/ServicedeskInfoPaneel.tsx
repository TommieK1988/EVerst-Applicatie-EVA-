'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Input } from '@/components/ui'
import {
  getServicedeskMandaat, getDoorlooptijdPerFase, updateServicedeskInstellingen,
  type MandaatStatus, type SubstatusFase,
} from '@/lib/dossiers/servicedesk'
import { FACTURATIE_LABELS, SERVICEDESK_ALLE_STATUSSEN } from '../types'
import { MandaatMeter } from '../servicedesk/MandaatMeter'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

// Doorlooptijd-drempels (dagen open). Aanpasbaar als constante.
const DRUK_ORANJE = 14
const DRUK_ROOD   = 30

const faseLabel = (k: string) => SERVICEDESK_ALLE_STATUSSEN.find(s => s.key === k)?.label ?? k

type Props = {
  dossierId: string
  titel: string
  createdAt: string | null
  initieelMandaat: number | null
  initieleFacturatiemethode: 'regie' | 'termijnen'
  /** Mutatiewerk gaat aangenomen; dan staat de methode standaard op Aangenomen (wel aanpasbaar). */
  isMutatie?: boolean
  /**
   * De actieknoppen, rechts in ditzelfde blok.
   *
   * Als slot en niet als eigen kaart: "wat is de stand van deze bon" en "wat kan ik ermee" zijn
   * één vraag, en ze stonden als twee losse blokken onder elkaar. De knoppen komen van buiten
   * omdat ze hun eigen vensters en server-acties meebrengen; dit blok hoeft daar niets van te
   * weten.
   */
  acties?: React.ReactNode
}

/** Veldlabel boven een cijfer of keuze — DS: uppercase, 10px, letterspacing 0.08em. */
function Kop({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
      {children}
    </div>
  )
}

function Regel({ label, bedrag }: { label: string; bedrag: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className="tabular-nums text-neutral-700">{fmt(bedrag)}</span>
    </div>
  )
}

export default function ServicedeskInfoPaneel({
  dossierId, titel, createdAt, initieelMandaat, initieleFacturatiemethode, isMutatie, acties,
}: Props) {
  const router = useRouter()
  const [mandaat, setMandaat]       = useState<string>(initieelMandaat != null ? String(initieelMandaat) : '')
  const [methode, setMethode]       = useState<'regie' | 'termijnen'>(initieleFacturatiemethode)
  const [status, setStatus]         = useState<MandaatStatus | null>(null)
  const [fases, setFases]           = useState<SubstatusFase[]>([])

  useEffect(() => {
    getServicedeskMandaat(dossierId).then(setStatus).catch(() => setStatus(null))
    getDoorlooptijdPerFase(dossierId).then(setFases).catch(() => setFases([]))
  }, [dossierId])

  const dagenOpen = createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
    : null
  const dagenKleur = dagenOpen == null ? 'var(--fg-muted)'
    : dagenOpen >= DRUK_ROOD ? '#d9534f'
    : dagenOpen >= DRUK_ORANJE ? '#d97706'
    : '#009439'

  async function bewaarMandaat() {
    const waarde = mandaat.trim() === '' ? null : Number(mandaat.replace(',', '.'))
    await updateServicedeskInstellingen(dossierId, { mandaat_bedrag: waarde })
    getServicedeskMandaat(dossierId).then(setStatus).catch(() => {})
  }

  async function kiesMethode(m: 'regie' | 'termijnen') {
    setMethode(m)
    const res = await updateServicedeskInstellingen(dossierId, { facturatiemethode: m })
    if (!res.ok) { toast.error(res.error); setMethode(methode); return }
    // Bij regie maakt de server meteen de kostengroep "Regiewerkzaamheden" aan; lukte dat niet, dan
    // is de methode wél gewijzigd maar valt er nog niets op te boeken. Dat hoort de gebruiker te
    // weten in plaats van het pas bij het factureren te ontdekken.
    if (res.waarschuwing) toast.error(res.waarschuwing, { duration: 8000 })
    else toast.success(`Facturatie op ${FACTURATIE_LABELS[m].toLowerCase()}`)
    // De kostengroep is nieuw voor elk scherm dat codes toont (werkbegroting, planning, verkoop).
    if (m === 'regie') router.refresh()
  }

  return (
    <Card className="col-span-2">
      <CardHeader>Servicedesk</CardHeader>
      <CardBody>
        {/* Vier kolommen naast elkaar in plaats van drie dingen uitgesmeerd over de volle breedte.
            Die breedte is op een dossierpagina bijna twee meter beeldscherm; met `justify-between`
            stond de doorlooptijd links en het mandaat rechts, en lag er tussen "Offerte
            uitgebracht" en "5 dagen" zoveel wit dat je met een liniaal moest meelezen welk getal
            bij welke fase hoorde. Elke kolom is nu zo breed als zijn inhoud vraagt en niet breder. */}
        <div className="flex flex-col gap-6 xl:flex-row xl:gap-8">
          <div className="grid min-w-0 flex-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">

            {/* Kolom 1 — de stand van de bon, van boven naar beneden. */}
            <div className="flex flex-col gap-4">
              <div>
                <Kop>Doorlooptijd</Kop>
                <div className="flex items-baseline gap-2">
                  <span className="tabular-nums text-[22px] font-bold" style={{ color: dagenKleur }}>
                    {dagenOpen != null ? `${dagenOpen}` : '—'}
                  </span>
                  <span className="text-[12px] text-neutral-500">dagen open</span>
                </div>
              </div>

              <div>
                <Kop>Facturatie</Kop>
                <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200">
                  {(['regie', 'termijnen'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => kiesMethode(m)}
                      className="px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
                      style={{
                        background: methode === m ? 'var(--accent)' : 'transparent',
                        color: methode === m ? '#fff' : 'var(--fg-muted)',
                      }}
                    >
                      {FACTURATIE_LABELS[m]}
                    </button>
                  ))}
                </div>
                {isMutatie && (
                  <div className="mt-1.5 max-w-[220px] text-[11px] leading-snug text-neutral-400">
                    Mutatiewerk staat standaard op Aangenomen.
                  </div>
                )}
              </div>

              <div>
                <Kop>Mandaat (excl. btw)</Kop>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-neutral-400">€</span>
                  <Input
                    value={mandaat}
                    onChange={e => setMandaat(e.target.value)}
                    onBlur={bewaarMandaat}
                    placeholder="0,00"
                    className="w-28 tabular-nums"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>

            {/* Kolom 2 — hoe het mandaat ervoor staat én waar dat bedrag vandaan komt. Dat waren
                twee losse dingen op twee plekken: de meter in een balk boven de tabs, de opbouw
                hier. Je las dan een percentage zonder te zien waardoor het vol liep. */}
            {status?.mandaat != null && status.mandaat > 0 && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
                <MandaatMeter mandaat={status.mandaat} totaal={status.totaal} />
                <div className="mb-2 mt-3 border-t border-neutral-200 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                  Verbruikt mandaat
                </div>
                <div className="flex flex-col gap-1 text-[12px]">
                  <Regel label="Geboekte verkoopwaarde" bedrag={status.geboekteVerkoop} />
                  <Regel
                    label={`Uitgezette opdrachten (incl. ${status.opslagPct}% opslag)`}
                    bedrag={status.uitgezetteOpdrachten}
                  />
                  <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1 font-semibold">
                    <span className="text-neutral-700">Totaal</span>
                    <span className="tabular-nums">{fmt(status.totaal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Kolom 3 — waar de tijd is gebleven. In een eigen kader met dezelfde breedte als het
                mandaatblok ernaast, zodat fase en aantal dagen bij elkaar blijven staan. */}
            {fases.length > 0 && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Tijd per fase</div>
                <div className="flex flex-col gap-1">
                  {fases.map((f, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span className="min-w-0 truncate text-neutral-700">{faseLabel(f.substatus)}</span>
                      <span className="shrink-0 tabular-nums text-neutral-500">
                        {f.dagen} {f.dagen === 1 ? 'dag' : 'dagen'}{f.tot ? '' : ' (huidig)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {acties && (
            <div className="w-full max-w-[320px] shrink-0 border-neutral-200 xl:w-[300px] xl:max-w-none xl:border-l xl:pl-7 dark:border-neutral-700">
              {acties}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
