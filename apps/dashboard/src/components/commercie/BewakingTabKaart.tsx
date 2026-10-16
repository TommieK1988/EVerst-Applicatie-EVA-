'use client'

/**
 * Tabblad Bewaking in het dossier: dezelfde offertekaart als in Te doen, aangevuld met wat je
 * alleen hier doet (eigenaar wijzigen, de stap, kans en verwachte opdracht handmatig zetten).
 *
 * Eén kaart op twee plekken, zodat de woorden, de velden en het uitkomstformulier niet meer
 * uit elkaar kunnen lopen.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { DossierRij } from '@/components/dossiers/types'
import { MedewerkerKiezer } from '@/components/ui/medewerker-kiezer'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { getOffertePaneel, type OffertePaneelData } from '@/lib/commercie/paneel'
import { zetCommercieelEigenaar } from '@/lib/commercie/eigenaar'
import { getBedragklassegrenzen } from '@/lib/commercie/bedragklassen-actions'
import type { Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'
import { OfferteKaart } from './OfferteKaart'
import { StapDialoog } from './StapDialoog'
import { kortDatum } from './te-doen'

type Props = {
  dossier: DossierRij
  medewerkers: { id: string; naam: string }[]
  mijnMedewerkerId: string | null
}

const LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500'

export function BewakingTabKaart(props: Props) {
  const router = useRouter()
  const vandaag = React.useMemo(() => vandaagNL(), [])
  const [data, setData] = React.useState<OffertePaneelData | null>(null)
  const [fout, setFout] = React.useState<string | null>(null)
  const [versie, setVersie] = React.useState(0)
  const [grenzen, setGrenzen] = React.useState<Bedragklassegrenzen | undefined>()
  const [stapOpen, setStapOpen] = React.useState(false)

  React.useEffect(() => { getBedragklassegrenzen().then(setGrenzen).catch(() => {}) }, [])
  React.useEffect(() => {
    let actief = true
    getOffertePaneel(props.dossier.id)
      .then(r => { if (actief) setData(r) })
      .catch((e: unknown) => { if (actief) setFout(e instanceof Error ? e.message : 'Laden mislukt') })
    return () => { actief = false }
  }, [props.dossier.id, versie])

  const ververs = React.useCallback(() => { setVersie(v => v + 1); router.refresh() }, [router])

  if (fout) return <p className="text-sm text-error-700">{fout}</p>
  if (!data) return <p className="text-sm text-neutral-500">Laden…</p>

  const kaart = data.bewaking.kaart
  const afgerond = data.bewaking.afgerond

  return (
    <div className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white">
      <OfferteKaart
        dossier={props.dossier}
        data={data}
        mijnMedewerkerId={props.mijnMedewerkerId}
        medewerkers={props.medewerkers}
        vandaag={vandaag}
        onVastgelegd={ververs}
        grenzen={grenzen}
        inDossier
        tijdlijnAlles
        eigenaarVeld={afgerond ? undefined : (
          <EigenaarKiezer
            dossierId={props.dossier.id}
            eigenaarId={kaart?.eigenaar_id ?? null}
            medewerkers={props.medewerkers}
            onGewijzigd={ververs}
          />
        )}
        beheer={afgerond ? null : (
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className={LABEL}>Kans</div>
              <div className="mt-0.5 text-[13px] font-medium text-neutral-900">
                {kaart?.kans_pct != null ? `${kaart.kans_pct}%` : <span className="text-neutral-400">Onbekend</span>}
              </div>
            </div>
            <div>
              <div className={LABEL}>Verwachte opdracht</div>
              <div className="mt-0.5 text-[13px] font-medium text-neutral-900">
                {kaart?.verwachte_opdracht
                  ? kortDatum(kaart.verwachte_opdracht, vandaag).replace(/^1 /, '')
                  : <span className="text-neutral-400">Niet ingevuld</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStapOpen(true)}
              className="ml-auto rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              Stap aanpassen
            </button>
          </div>
        )}
      />
      <StapDialoog
        open={stapOpen}
        onOpenChange={setStapOpen}
        dossierId={props.dossier.id}
        kaart={kaart}
        medewerkers={props.medewerkers}
        onOpgeslagen={ververs}
      />
    </div>
  )
}

function EigenaarKiezer(props: {
  dossierId: string
  eigenaarId: string | null
  medewerkers: { id: string; naam: string }[]
  onGewijzigd: () => void
}) {
  const [waarde, setWaarde] = React.useState(props.eigenaarId ?? '')
  const [bezig, setBezig] = React.useState(false)
  React.useEffect(() => setWaarde(props.eigenaarId ?? ''), [props.eigenaarId])

  async function wijzig(nieuw: string) {
    const vorige = waarde
    setWaarde(nieuw)
    setBezig(true)
    const res = await zetCommercieelEigenaar(props.dossierId, nieuw || null)
    setBezig(false)
    if (!res.ok) { setWaarde(vorige); toast.error(res.error); return }
    toast.success('Eigenaar opgeslagen')
    props.onGewijzigd()
  }

  return (
    <div className="min-w-0">
      <div className={LABEL}>Eigenaar</div>
      <MedewerkerKiezer
        medewerkers={props.medewerkers}
        value={waarde}
        disabled={bezig}
        onChange={wijzig}
        leegLabel="Nog niet bepaald"
        className="mt-0.5 h-8"
      />
    </div>
  )
}
