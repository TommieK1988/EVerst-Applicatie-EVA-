'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, List, CalendarDays, Plus, X } from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { nl } from 'date-fns/locale'
import type {
  BedrijfsagendaRegel,
  BedrijfsagendaVirtueel,
  GebruikerLayout,
  BedrijfsagendaItemMetDoelgroep,
  MedewerkerAfdeling,
  Medewerker,
} from '@everts/database/platform-types'
import { bedrijfsagendaTypeKleur } from '@everts/database/platform-types'
import MaandKalender from '@/components/planning/MaandKalender'
import AgendaLijst from '@/components/planning/AgendaLijst'
import AgendaItemModal from '@/components/planning/AgendaItemModal'
import { Button, Dialog, DialogContent } from '@/components/ui'

type Props = {
  regels: BedrijfsagendaRegel[]
  layouts: GebruikerLayout[]
  user_id: string | null
  afdelingen?: Pick<MedewerkerAfdeling, 'id' | 'naam'>[]
  medewerkers?: Pick<Medewerker, 'id' | 'voornaam' | 'tussenvoegsel' | 'achternaam' | 'afdeling'>[]
}

type Weergave = 'maand' | 'lijst'

const ALLE_TYPES = [
  { type: 'feestdag',   label: 'Feestdag',    kleur: '#dc2626' },
  { type: 'verjaardag', label: 'Verjaardag',  kleur: '#f59e0b' },
  { type: 'jubileum',   label: 'Jubileum',    kleur: '#8b5cf6' },
  { type: 'atv_dag',    label: 'ATV-dag',     kleur: bedrijfsagendaTypeKleur.atv_dag },
  { type: 'teamoverleg',label: 'Teamoverleg', kleur: bedrijfsagendaTypeKleur.teamoverleg },
  { type: 'vca_toolbox',label: 'VCA Toolbox', kleur: bedrijfsagendaTypeKleur.vca_toolbox },
  { type: 'audit',      label: 'Audit',       kleur: bedrijfsagendaTypeKleur.audit },
  { type: 'activiteit', label: 'Activiteit',  kleur: bedrijfsagendaTypeKleur.activiteit },
  { type: 'herinnering',label: 'Herinnering', kleur: bedrijfsagendaTypeKleur.herinnering },
  { type: 'overig',     label: 'Overig',      kleur: bedrijfsagendaTypeKleur.overig },
]

export default function BedrijfsagendaView({
  regels, layouts, user_id, afdelingen = [], medewerkers = [],
}: Props) {
  const router = useRouter()
  const [weergave, setWeergave]         = useState<Weergave>('maand')
  const [peildatum, setPeildatum]       = useState(() => new Date())
  const [geselecteerd, setGeselecteerd] = useState<BedrijfsagendaItemMetDoelgroep | null>(null)
  const [geselecteerdBerekend, setGeselecteerdBerekend] = useState<(BedrijfsagendaVirtueel & { bron: 'berekend' }) | null>(null)
  const [maakNieuw, setMaakNieuw]       = useState(false)
  const [nieuweItemDatum, setNieuweItemDatum] = useState<string | undefined>(undefined)
  const [actieveTypes, setActieveTypes] = useState<string[]>([])

  type HerhalingsKeuze = {
    occurrence: BedrijfsagendaItemMetDoelgroep & { bron: 'handmatig'; series_id: string }
    original:   BedrijfsagendaItemMetDoelgroep & { bron: 'handmatig' }
  }
  const [herhalingsKeuze, setHerhalingsKeuze] = useState<HerhalingsKeuze | null>(null)
  const [occurrenceEdit, setOccurrenceEdit] = useState<{
    item: BedrijfsagendaItemMetDoelgroep
    seriesId: string
    occurrenceDatum: string
  } | null>(null)

  function vorigeMaand()   { setPeildatum(d => subMonths(d, 1)) }
  function volgendeMaand() { setPeildatum(d => addMonths(d, 1)) }
  function naarVandaag()   { setPeildatum(new Date()) }

  const handleItemClick = useCallback((item: BedrijfsagendaRegel) => {
    if (item.bron === 'berekend') {
      setGeselecteerdBerekend(item)
      return
    }
    if (item.series_id) {
      const original = regels.find(r => r.bron === 'handmatig' && r.id === item.series_id)
      if (original) {
        setHerhalingsKeuze({
          occurrence: item as BedrijfsagendaItemMetDoelgroep & { bron: 'handmatig'; series_id: string },
          original:   original as BedrijfsagendaItemMetDoelgroep & { bron: 'handmatig' },
        })
      } else {
        setGeselecteerd(item as BedrijfsagendaItemMetDoelgroep)
      }
      return
    }
    setGeselecteerd(item as BedrijfsagendaItemMetDoelgroep)
  }, [regels])

  const handleDagClick = useCallback((datum: string) => {
    setNieuweItemDatum(datum)
    setMaakNieuw(true)
  }, [])

  function handleSaved() { router.refresh() }

  function toggleType(type: string) {
    setActieveTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const gefilterdRegels = actieveTypes.length === 0
    ? regels
    : regels.filter(r => actieveTypes.includes(r.type))

  const maandLabel = format(peildatum, 'MMMM yyyy', { locale: nl })

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 16px', flexWrap: 'wrap' }}>
        <Button variant="ghost" size="icon-md" onClick={vorigeMaand} aria-label="Vorige maand">
          <ChevronLeft size={16} />
        </Button>
        <Button variant="ghost" size="sm" onClick={naarVandaag}>
          Vandaag
        </Button>
        <Button variant="ghost" size="icon-md" onClick={volgendeMaand} aria-label="Volgende maand">
          <ChevronRight size={16} />
        </Button>

        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginLeft: 4, minWidth: 160, textTransform: 'capitalize' }}>
          {maandLabel}
        </span>

        <div style={{ flex: 1 }} />

        <div className="flex border border-[var(--border)] rounded-[7px] overflow-hidden">
          {(['maand', 'lijst'] as Weergave[]).map(w => (
            <Button
              key={w}
              variant={weergave === w ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setWeergave(w)}
              title={w === 'maand' ? 'Maandoverzicht' : 'Lijstweergave'}
              className="rounded-none"
            >
              {w === 'maand' ? <CalendarDays size={14} /> : <List size={14} />}
              {w === 'maand' ? 'Maand' : 'Lijst'}
            </Button>
          ))}
        </div>

        <Button
          variant="primary"
          onClick={() => { setNieuweItemDatum(undefined); setMaakNieuw(true) }}
        >
          <Plus size={14} />
          Nieuw item
        </Button>
      </div>

      {/* Legenda / Filterknoppen */}
      {weergave === 'maand' ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {ALLE_TYPES.map(({ kleur, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--fg-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: kleur, flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {ALLE_TYPES.map(({ type, label, kleur }) => {
            const actief = actieveTypes.includes(type)
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 20,
                  background: actief ? kleur + '22' : 'transparent',
                  color: actief ? kleur : 'var(--fg-muted)',
                  border: `1px solid ${actief ? kleur : 'var(--border)'}`,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: actief ? kleur : 'var(--fg-muted)', flexShrink: 0 }} />
                {label}
              </button>
            )
          })}
          {actieveTypes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActieveTypes([])}
            >
              <X size={10} />
              Wis filter
            </Button>
          )}
        </div>
      )}

      {/* Inhoud */}
      {weergave === 'maand' ? (
        <MaandKalender
          peildatum={peildatum}
          regels={regels}
          onItemClick={handleItemClick}
          onDagClick={handleDagClick}
        />
      ) : (
        <AgendaLijst
          regels={gefilterdRegels}
          layouts={layouts}
          user_id={user_id}
          onItemClick={handleItemClick}
        />
      )}

      {/* Modals */}
      {maakNieuw && (
        <AgendaItemModal
          initialDatum={nieuweItemDatum}
          afdelingen={afdelingen}
          medewerkers={medewerkers}
          onClose={() => { setMaakNieuw(false); setNieuweItemDatum(undefined) }}
          onSaved={handleSaved}
        />
      )}

      {geselecteerd && (
        <AgendaItemModal
          item={geselecteerd}
          afdelingen={afdelingen}
          medewerkers={medewerkers}
          onClose={() => setGeselecteerd(null)}
          onSaved={handleSaved}
        />
      )}

      {geselecteerdBerekend && (
        <BerekeendItemDetail
          item={geselecteerdBerekend}
          onClose={() => setGeselecteerdBerekend(null)}
        />
      )}

      {herhalingsKeuze && (
        <HerhalingsKeuzeDialoog
          onAlleenDitItem={() => {
            const { occurrence } = herhalingsKeuze
            setHerhalingsKeuze(null)
            setOccurrenceEdit({
              item: occurrence,
              seriesId: occurrence.series_id,
              occurrenceDatum: occurrence.start_datum,
            })
          }}
          onAlleItemsInReeks={() => {
            setGeselecteerd(herhalingsKeuze.original)
            setHerhalingsKeuze(null)
          }}
          onAnnuleer={() => setHerhalingsKeuze(null)}
        />
      )}

      {occurrenceEdit && (
        <AgendaItemModal
          item={occurrenceEdit.item}
          seriesId={occurrenceEdit.seriesId}
          occurrenceDatum={occurrenceEdit.occurrenceDatum}
          afdelingen={afdelingen}
          medewerkers={medewerkers}
          onClose={() => setOccurrenceEdit(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function HerhalingsKeuzeDialoog({
  onAlleenDitItem,
  onAlleItemsInReeks,
  onAnnuleer,
}: {
  onAlleenDitItem: () => void
  onAlleItemsInReeks: () => void
  onAnnuleer: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onAnnuleer() }}>
      <DialogContent size="sm" hideClose style={{ width: 380, padding: '28px 32px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>
            Herhalend item bewerken
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Wil je alleen dit voorkomen aanpassen of alle items in de reeks?
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="primary" onClick={onAlleenDitItem} style={{ width: '100%' }}>
            Alleen dit item
          </Button>
          <Button variant="ghost" onClick={onAlleItemsInReeks} style={{ width: '100%' }}>
            Alle items in de reeks
          </Button>
          <Button variant="ghost" onClick={onAnnuleer} style={{ width: '100%', color: 'var(--fg-muted)' }}>
            Annuleren
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BerekeendItemDetail({
  item, onClose,
}: {
  item: BedrijfsagendaVirtueel & { bron: 'berekend' }
  onClose: () => void
}) {
  const typeLabel: Record<string, string> = {
    feestdag:   'Feestdag',
    verjaardag: 'Verjaardag',
    jubileum:   'Jubileum',
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size="sm" hideClose style={{ width: 400, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.kleur, marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              {typeLabel[item.type] ?? item.type}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{item.titel}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
              {item.start_datum.split('-').reverse().join('-')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Sluiten</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
