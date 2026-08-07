'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus, IconSearch, IconDomeinOnderhoud } from '../eva/Icons'
import {
  Button, Input, EmptyState,
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui'
import { DossierKaart } from './DossierKaart'
import { NieuweAanvraagModal, type AanvraagCategorie, type AanvraagWerkmaatschappij } from './NieuweAanvraagModal'
import toast from 'react-hot-toast'
import { wijzigSubstatusMetConflict } from './substatus-wijzigen'
import { useDialogen } from '@/components/ui/dialogen'
import { getDossierSubstatus, isBouw7Substatus, isAfsluitendeSubstatus } from './types'
import { dossierPad, openDossierInNieuwTabblad } from './open-dossier'
import type { DossierSectie, DossierSubstatus, DossierRij, StatusDef } from './types'

// Volgorde-gebaseerde statuskleur (eerste = brand, rest cyclisch)
const STATUS_COLORS = [
  'var(--brand-500)',
  'var(--info-500)',
  'var(--warning-500)',
  'var(--neutral-400)',
  'var(--success-500)',
  'var(--error-500)',
]

/**
 * Bepaalt welk veld als kanban-kolomsleutel wordt gebruikt.
 * Serialiseerbaar als string-prop vanuit Server Components.
 */
export type KolomKeyModus = 'auto' | 'offerte_substatus' | 'servicedesk_substatus'

function resolveKolomKeyFn(modus: KolomKeyModus): (d: DossierRij) => string {
  if (modus === 'offerte_substatus')   return d => d.offerte_substatus   ?? 'concept'
  if (modus === 'servicedesk_substatus') return d => d.servicedesk_substatus ?? 'nieuw'
  return getDossierSubstatus
}

type Props<K extends string> = {
  sectie: DossierSectie
  statussen: StatusDef<K>[]
  dossiers: DossierRij[]
  kanNieuwAanmaken?: boolean
  categorieen?: AanvraagCategorie[]
  werkmaatschappijen?: AanvraagWerkmaatschappij[]
  viewToggle?: React.ReactNode
  extraActies?: React.ReactNode
  /** Welk veld als kolomsleutel gebruiken (serialiseerbaar). Default: 'auto'. */
  kolomKeyModus?: KolomKeyModus
  /** Overschrijf de status-update actie bij drag & drop (default: updateDossierSubstatus). */
  onStatusChange?: (id: string, status: string) => Promise<{ ok: boolean; error?: string }>
}

export function DossierKanban<K extends string>({
  sectie, statussen, dossiers: initieel, kanNieuwAanmaken = false, categorieen, werkmaatschappijen, viewToggle, extraActies,
  kolomKeyModus = 'auto', onStatusChange,
}: Props<K>) {
  const router    = useRouter()
  const { bevestig } = useDialogen()

  const [dossiers,    setDossiers]    = React.useState<DossierRij[]>(initieel)
  const [draggingId,  setDraggingId]  = React.useState<string | null>(null)

  // Sync internal state when parent passes a filtered list (e.g. slicer changes)
  React.useEffect(() => { setDossiers(initieel) }, [initieel])
  const [dragOverCol, setDragOverCol] = React.useState<string | null>(null)
  const [modalOpen,   setModalOpen]   = React.useState(false)
  const [zoek,        setZoek]        = React.useState('')
  /** Gezet zodra er naar een afsluitende kolom is gesleept; de dialoog bevestigt of annuleert. */
  const [afsluitBevestiging, setAfsluitBevestiging] =
    React.useState<{ dossierId: string; status: K } | null>(null)

  const zoekQ = zoek.trim().toLowerCase()
  const gefilterd = zoekQ
    ? dossiers.filter(d =>
        [
          d.titel, d.klant_naam, d.dossiernummer,
          d.contactpersoon_naam,
          d.werkadres_naam,
          [d.werkadres_straat, d.werkadres_huisnummer, d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
          d.factuuradres_tekst,
        ].some(v => v?.toLowerCase().includes(zoekQ))
      )
    : dossiers

  /**
   * Voert de statuswijziging uit: optimistisch de kaart verplaatsen, dan de server-action (die de
   * status óók naar Bouw7 terugschrijft). Los van `handleDrop` omdat een afsluitende status eerst
   * langs een bevestigingsdialoog gaat.
   */
  async function voerStatuswijzigingUit(dossierId: string, targetStatus: K) {
    setDossiers(prev =>
      prev.map(d => {
        if (d.id !== dossierId) return d
        return {
          ...d,
          aanvraag_substatus: d.hoofdstatus === 'aanvraag' ? targetStatus as any : d.aanvraag_substatus,
          offerte_substatus:  d.hoofdstatus === 'offerte'  ? targetStatus as any : d.offerte_substatus,
          opdracht_substatus: d.hoofdstatus === 'opdracht' ? targetStatus as any : d.opdracht_substatus,
        }
      })
    )
    // Two-way: schrijf de statuswijziging direct terug naar Bouw7 — opdracht naar de projectstatus,
    // aanvraag/offerte naar het gedeelde maatwerkveld "Offerte Sub-status". Bij een botsing met de
    // tweede Bouw7-app legt de gedeelde helper de keuze voor (Bouw7 volgen of tóch overschrijven);
    // hoe dat afloopt, de kaart moet daarna hoe dan ook de echte stand tonen.
    await wijzigSubstatusMetConflict({
      dossierId,
      substatus: targetStatus as DossierSubstatus,
      sectie,
      bevestig,
    })
    router.refresh()
  }

  async function handleDrop(targetStatus: K) {
    if (!draggingId) return

    const gesleept = dossiers.find(d => d.id === draggingId)

    // Opdracht-dossiers zijn two-way: slepen naar een Bouw7-eigen opdracht-substatus is toegestaan
    // en wordt teruggeschreven naar Bouw7. Voor offerte/servicedesk blijven Bouw7-eigen substatussen
    // alleen-lezen in EVA (geen 1:1 Bouw7-projectstatus) — daar weigeren we de drop nog steeds.
    if (
      sectie !== 'opdracht' &&
      gesleept && (gesleept as any).bouw7_id != null && isBouw7Substatus(sectie, targetStatus)
    ) {
      setDraggingId(null)
      setDragOverCol(null)
      toast.error('Deze status komt uit Bouw7 en is alleen daar te wijzigen.')
      return
    }

    if (onStatusChange) {
      // Servicedesk of andere custom update: optimistisch servicedesk_substatus bijwerken
      setDossiers(prev =>
        prev.map(d => d.id !== draggingId ? d : { ...d, servicedesk_substatus: targetStatus as any })
      )
      setDraggingId(null)
      setDragOverCol(null)
      await onStatusChange(draggingId, targetStatus)
      return
    }

    const id = draggingId
    setDraggingId(null)
    setDragOverCol(null)

    // Afsluitende status (Afgewezen/Vervallen/Verloren): het dossier wordt daarna alleen-lezen en
    // in Bouw7 kan het project op "08. Afgewezen" komen. Eerst bevestigen — een misslag met de muis
    // is niet meer terug te draaien.
    if (isAfsluitendeSubstatus(sectie, targetStatus)) {
      setAfsluitBevestiging({ dossierId: id, status: targetStatus })
      return
    }

    await voerStatuswijzigingUit(id, targetStatus)
  }

  const afsluitDossier = afsluitBevestiging
    ? dossiers.find(d => d.id === afsluitBevestiging.dossierId)
    : null
  const afsluitLabel = afsluitBevestiging
    ? (statussen.find(s => s.key === afsluitBevestiging.status)?.label ?? afsluitBevestiging.status)
    : ''

  return (
    <>
      {kanNieuwAanmaken && (
        <NieuweAanvraagModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAanmaken={nieuw => setDossiers(prev => [nieuw, ...prev])}
          categorieen={categorieen}
          werkmaatschappijen={werkmaatschappijen}
        />
      )}

      {/* Bevestiging vóór een afsluitende status: daarna is het dossier alleen-lezen. */}
      <AlertDialog
        open={afsluitBevestiging != null}
        onOpenChange={open => { if (!open) setAfsluitBevestiging(null) }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Dossier op &ldquo;{afsluitLabel}&rdquo; zetten?</AlertDialogTitle>
          <AlertDialogDescription>
            {afsluitDossier?.dossiernummer ? `${afsluitDossier.dossiernummer} — ` : ''}
            {afsluitDossier?.titel ?? 'Dit dossier'} wordt hiermee afgesloten en is daarna
            <strong> overal alleen-lezen</strong>; je kunt dit niet meer ongedaan maken in EVA.
            De status wordt ook naar Bouw7 teruggeschreven.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const b = afsluitBevestiging
                setAfsluitBevestiging(null)
                if (b) await voerStatuswijzigingUit(b.dossierId, b.status)
              }}
            >
              Ja, afsluiten
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px)', background: 'var(--bg)' }}>

        {/* Toolbar */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <Input
            prefix={<IconSearch size={14} />}
            placeholder="Zoek dossier, klant, contactpersoon of adres…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="w-64"
          />
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 4 }}>
            {gefilterd.length} van {dossiers.length}
          </span>
          <div style={{ flex: 1 }} />
          <React.Fragment key="extra-actie">{extraActies ?? null}</React.Fragment>
          <React.Fragment key="view-toggle">{viewToggle ?? null}</React.Fragment>
          {kanNieuwAanmaken && (
            <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
              <IconPlus size={14} />
              Nieuwe {sectie === 'aanvraag' ? 'aanvraag' : sectie === 'offerte' ? 'offerte' : 'opdracht'}
            </Button>
          )}
        </div>

        {/* Kanban */}
        <div style={{ display: 'flex', flex: 1, overflowX: 'hidden', overflowY: 'hidden' }}>
          {statussen.map((s, idx) => {
            const resolveKey = resolveKolomKeyFn(kolomKeyModus)
            const kolom = gefilterd.filter(d => resolveKey(d) === s.key)
            const isDragOver = dragOverCol === s.key

            const kolomKleur = STATUS_COLORS[idx % STATUS_COLORS.length]

            return (
              <div
                key={s.key}
                onDragOver={e => { e.preventDefault(); setDragOverCol(s.key) }}
                onDragLeave={e => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
                    setDragOverCol(null)
                }}
                onDrop={() => handleDrop(s.key as K)}
                style={{
                  flex: 1, minWidth: 0,
                  display: 'flex', flexDirection: 'column',
                  borderRight: '1px solid var(--border)',
                  background: isDragOver
                    ? 'color-mix(in srgb, var(--brand-500) 4%, var(--bg))'
                    : 'var(--bg)',
                  transition: 'background 0.15s',
                }}
              >
                {/* Kolom header — DS KanbanColumn-stijl */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 14px 10px',
                  borderBottom: `2px solid ${isDragOver ? 'var(--brand-500)' : kolomKleur}`,
                  flexShrink: 0, transition: 'border-color 0.15s',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: kolomKleur, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--neutral-800)', flex: 1 }}>
                    {s.label}
                  </span>
                  <span style={{
                    minWidth: 20, height: 20, borderRadius: 999, padding: '0 6px',
                    background: kolom.length > 0 ? 'var(--neutral-200)' : 'transparent',
                    color: 'var(--neutral-600)', fontSize: 10.5, fontWeight: 700,
                    display: 'grid', placeItems: 'center',
                  }}>
                    {kolom.length}
                  </span>
                </div>

                {/* Kaarten */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {kolom.map(d => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={e => { setDraggingId(d.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                      style={{
                        opacity: draggingId === d.id ? 0.35 : 1,
                        cursor: draggingId ? 'grabbing' : 'grab',
                        transition: 'opacity 0.15s', userSelect: 'none',
                      }}
                    >
                      <DossierKaart
                        dossier={d}
                        sectie={sectie}
                        draggingActief={draggingId != null}
                        onClick={() => { if (draggingId) return; openDossierInNieuwTabblad(dossierPad(sectie, d.id)) }}
                      />
                    </div>
                  ))}

                  {kolom.length === 0 && (
                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '32px 12px',
                    }}>
                      <EmptyState
                        icon={<IconDomeinOnderhoud size={24} />}
                        title="Leeg"
                        size="sm"
                        tone="neutral"
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
