'use client'
import React from 'react'
import { DossierKanban } from './DossierKanban'
import type { KolomKeyModus } from './DossierKanban'
import { DossierLijst } from './DossierLijst'
import type { AanvraagCategorie, AanvraagWerkmaatschappij } from './NieuweAanvraagModal'
import { InternDossiersKnop } from './InternDossiersKnop'
import { IconGrid, IconList } from '@/components/eva/Icons'
import type { DossierSectie, DossierSubstatus, DossierRij, StatusDef } from './types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { crewKleur, crewInitialen } from '@/lib/utils/crew'

type ViewMode = 'kanban' | 'lijst'

type Props = {
  sectie: DossierSectie
  statussen: StatusDef<string>[]
  dossiers: DossierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  kanNieuwAanmaken?: boolean
  categorieen?: AanvraagCategorie[]
  werkmaatschappijen?: AanvraagWerkmaatschappij[]
  extraActies?: React.ReactNode
  kolomKeyModus?: KolomKeyModus
  onStatusChange?: (id: string, status: string) => Promise<{ ok: boolean; error?: string }>
  /** Naam van de ingelogde medewerker — wordt voorgeselecteerd in de personen-slicer (bv. via ?mijn=1). */
  mijnNaam?: string | null
}

export function DossierViewSwitcher({ sectie, statussen, dossiers, layouts, user_id, kanNieuwAanmaken, categorieen, werkmaatschappijen, extraActies, kolomKeyModus, onStatusChange, mijnNaam }: Props) {
  const storageKey = `dossier-view-${sectie}`

  const [view, setView] = React.useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'kanban'
    return (localStorage.getItem(storageKey) as ViewMode) ?? 'kanban'
  })

  const [geselecteerdeLeiders, setGeselecteerdeLeiders] = React.useState<string[]>(
    mijnNaam ? [mijnNaam] : [],
  )
  // "Niet toegewezen": toon alleen dossiers zonder gekoppelde persoon (sectie-afhankelijk).
  const [alleenNietToegewezen, setAlleenNietToegewezen] = React.useState(false)

  function switchView(v: ViewMode) {
    setView(v)
    localStorage.setItem(storageKey, v)
  }

  function toggleLeider(naam: string) {
    setAlleenNietToegewezen(false)
    setGeselecteerdeLeiders(prev =>
      prev.includes(naam) ? prev.filter(n => n !== naam) : [...prev, naam]
    )
  }

  function toggleNietToegewezen() {
    setAlleenNietToegewezen(prev => {
      const next = !prev
      if (next) setGeselecteerdeLeiders([]) // sluit personen-selectie uit
      return next
    })
  }

  // Voor aanvraag/offerte: filter op calculator; voor opdracht/servicedesk: op projectleider
  const isCalculatorSectie = sectie === 'aanvraag' || sectie === 'offerte'
  function persoonsNaamVoorFilter(d: DossierRij): string | null {
    return isCalculatorSectie
      ? (d.calculator_naam ?? d.werkvoorbereider_naam ?? null)
      : d.projectleider_naam
  }
  function persoonsKleurVoorFilter(d: DossierRij): string | null {
    return isCalculatorSectie
      ? (d.calculator_kleur ?? d.werkvoorbereider_kleur ?? null)
      : d.projectleider_kleur
  }

  const uniekePLs = React.useMemo(() => {
    const namen = dossiers
      .map(d => persoonsNaamVoorFilter(d))
      .filter((n): n is string => !!n)
    // Neem een eventueel voorgeselecteerde naam altijd op, zodat de chip + "Wis filter"
    // zichtbaar zijn — ook als de gebruiker de enige persoon in de lijst is.
    if (mijnNaam) namen.push(mijnNaam)
    return [...new Set(namen)].sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossiers, sectie, mijnNaam])

  const kleurPerLeider = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of dossiers) {
      const naam = persoonsNaamVoorFilter(d)
      const kleur = persoonsKleurVoorFilter(d)
      if (naam && kleur && !map[naam]) map[naam] = kleur
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossiers, sectie])

  // Zijn er überhaupt niet-toegewezen dossiers? (bepaalt of de knop getoond wordt)
  const heeftNietToegewezen = React.useMemo(
    () => dossiers.some(d => !d.intern && persoonsNaamVoorFilter(d) == null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dossiers, sectie],
  )

  // Gefilterde dossiers op basis van geselecteerde personen / "Niet toegewezen"
  const gefilterdeDossiers = React.useMemo(() => {
    if (alleenNietToegewezen) return dossiers.filter(d => persoonsNaamVoorFilter(d) == null)
    if (geselecteerdeLeiders.length === 0) return dossiers
    return dossiers.filter(d => geselecteerdeLeiders.includes(persoonsNaamVoorFilter(d) ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossiers, geselecteerdeLeiders, alleenNietToegewezen, sectie])

  // Interne dossiers (Intern-toggle aan) worden verborgen op het bord/lijst en
  // alleen via de Intern-popup getoond.
  const interneDossiers  = React.useMemo(() => gefilterdeDossiers.filter(d => d.intern),  [gefilterdeDossiers])
  const zichtbareDossiers = React.useMemo(() => gefilterdeDossiers.filter(d => !d.intern), [gefilterdeDossiers])

  const toggle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <InternDossiersKnop dossiers={interneDossiers} sectie={sectie} />
    <div style={{ display: 'flex', gap: 2, background: 'var(--neutral-100)', borderRadius: 6, padding: 2 }}>
      <button
        onClick={() => switchView('kanban')}
        title="Kanban-weergave"
        style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 4,
          border: 'none', cursor: 'pointer',
          background: view === 'kanban' ? 'white' : 'transparent',
          color: view === 'kanban' ? 'var(--brand-600)' : 'var(--neutral-500)',
          boxShadow: view === 'kanban' ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
          transition: 'all 120ms',
        }}
      >
        <IconGrid size={14} />
      </button>
      <button
        onClick={() => switchView('lijst')}
        title="Lijstweergave"
        style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 4,
          border: 'none', cursor: 'pointer',
          background: view === 'lijst' ? 'white' : 'transparent',
          color: view === 'lijst' ? 'var(--brand-600)' : 'var(--neutral-500)',
          boxShadow: view === 'lijst' ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
          transition: 'all 120ms',
        }}
      >
        <IconList size={14} />
      </button>
    </div>
    </div>
  )

  // Slicer balk — tonen bij ≥ 2 unieke personen, of als er een filter actief is
  // (bv. voorgeselecteerd via ?mijn=1) zodat de gebruiker die kan wissen, of als er
  // niet-toegewezen dossiers zijn (dan tonen we de "Niet toegewezen"-knop).
  const slicerBalk = (uniekePLs.length >= 2 || geselecteerdeLeiders.length > 0 || heeftNietToegewezen || alleenNietToegewezen) ? (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap',
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {uniekePLs.map(naam => {
        const actief = !alleenNietToegewezen && (geselecteerdeLeiders.length === 0 || geselecteerdeLeiders.includes(naam))
        const kleur  = kleurPerLeider[naam] ?? crewKleur(crewInitialen(naam))
        return (
          <button
            key={naam}
            onClick={() => toggleLeider(naam)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px 3px 4px',
              borderRadius: 99,
              border: `1.5px solid ${actief ? kleur : 'var(--border)'}`,
              background: actief ? `${kleur}18` : 'transparent',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: actief ? 'var(--neutral-900)' : 'var(--neutral-400)',
              transition: 'all 0.12s',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              display: 'inline-grid', placeItems: 'center',
              background: actief
                ? `linear-gradient(135deg, ${kleur}, ${kleur}cc)`
                : 'var(--neutral-200)',
              color: actief ? '#fff' : 'var(--neutral-500)',
              fontSize: 8, fontWeight: 700, flexShrink: 0,
            }}>
              {crewInitialen(naam)}
            </span>
            {naam}
          </button>
        )
      })}
      {(heeftNietToegewezen || alleenNietToegewezen) && (
        <button
          onClick={toggleNietToegewezen}
          title="Toon alleen dossiers zonder gekoppelde persoon"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px',
            borderRadius: 99,
            border: `1.5px ${alleenNietToegewezen ? 'solid var(--warning-500, #d97706)' : 'dashed var(--border)'}`,
            background: alleenNietToegewezen ? 'var(--warning-50, #fffbeb)' : 'transparent',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
            color: alleenNietToegewezen ? 'var(--warning-700, #b45309)' : 'var(--neutral-500)',
            transition: 'all 0.12s',
          }}
        >
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            display: 'inline-grid', placeItems: 'center',
            background: alleenNietToegewezen ? 'var(--warning-500, #d97706)' : 'var(--neutral-200)',
            color: alleenNietToegewezen ? '#fff' : 'var(--neutral-500)',
            fontSize: 11, fontWeight: 700, flexShrink: 0, lineHeight: 1,
          }}>?</span>
          Niet toegewezen
        </button>
      )}
      {(geselecteerdeLeiders.length > 0 || alleenNietToegewezen) && (
        <button
          onClick={() => { setGeselecteerdeLeiders([]); setAlleenNietToegewezen(false) }}
          style={{
            padding: '3px 9px',
            borderRadius: 99,
            border: '1.5px solid var(--border)',
            background: 'transparent',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
            color: 'var(--neutral-400)',
            transition: 'all 0.12s',
          }}
        >
          Wis filter
        </button>
      )}
    </div>
  ) : null

  if (view === 'lijst') {
    return (
      <>
        {slicerBalk}
        <DossierLijst
          sectie={sectie}
          statussen={statussen as StatusDef<DossierSubstatus>[]}
          dossiers={zichtbareDossiers}
          layouts={layouts}
          user_id={user_id}
          kanNieuwAanmaken={kanNieuwAanmaken}
          categorieen={categorieen}
          werkmaatschappijen={werkmaatschappijen}
          extraActies={extraActies}
          viewToggle={toggle}
        />
      </>
    )
  }

  return (
    <>
      {slicerBalk}
      <DossierKanban
        sectie={sectie}
        statussen={statussen}
        dossiers={zichtbareDossiers}
        kanNieuwAanmaken={kanNieuwAanmaken}
        categorieen={categorieen}
        werkmaatschappijen={werkmaatschappijen}
        extraActies={extraActies}
        kolomKeyModus={kolomKeyModus}
        onStatusChange={onStatusChange}
        viewToggle={toggle}
      />
    </>
  )
}
