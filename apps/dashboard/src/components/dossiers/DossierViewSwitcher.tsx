'use client'
import React from 'react'
import { DossierKanban } from './DossierKanban'
import type { KolomKeyModus } from './DossierKanban'
import { DossierLijst } from './DossierLijst'
import type { AanvraagCategorie, AanvraagWerkmaatschappij } from './NieuweAanvraagModal'
import { InternDossiersKnop } from './InternDossiersKnop'
import { IconGrid, IconList, IconCheck } from '@/components/eva/Icons'
import { isServicedeskDossier } from './types'
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
  /** Toon het soort-filter (Servicedesk / Projecten) in het filtermenu rechtsboven. */
  toonSoortSlicer?: boolean
}

type SoortKeuze = 'servicedesk' | 'project'

const SOORT_KLEUR: Record<SoortKeuze, string> = {
  servicedesk: '#0891b2',
  project:     '#3b82f6',
}

const SOORT_LABEL: Record<SoortKeuze, string> = {
  servicedesk: 'Servicedesk',
  project:     'Projecten',
}

function IconTrechter({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5h17l-6.5 7.6V19l-4 2v-8.4z" />
    </svg>
  )
}

/** Eén aanvinkbare regel in het filtermenu. */
function FilterRij({ actief, kleur, label, aantal, initialen, onClick }: {
  actief: boolean
  kleur: string
  label: string
  aantal: number
  /** Gevuld voor personen (toont een gekleurde avatar), leeg voor soorten (toont een stip). */
  initialen?: string
  onClick: () => void
}) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '5px 8px', borderRadius: 6, border: 'none',
        background: hover ? 'var(--neutral-100)' : 'transparent',
        cursor: 'pointer', fontSize: 12.5, fontWeight: actief ? 600 : 500,
        color: 'var(--neutral-900)', textAlign: 'left',
      }}
    >
      <span style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        border: `1.5px solid ${actief ? kleur : 'var(--border)'}`,
        background: actief ? kleur : 'transparent',
        color: '#fff',
      }}>
        {actief && <IconCheck size={10} />}
      </span>
      {initialen ? (
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          display: 'inline-grid', placeItems: 'center',
          background: `linear-gradient(135deg, ${kleur}, ${kleur}cc)`,
          color: '#fff', fontSize: 8, fontWeight: 700,
        }}>{initialen}</span>
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: kleur, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--neutral-400)' }}>{aantal}</span>
    </button>
  )
}

export function DossierViewSwitcher({ sectie, statussen, dossiers, layouts, user_id, kanNieuwAanmaken, categorieen, werkmaatschappijen, extraActies, kolomKeyModus, onStatusChange, mijnNaam, toonSoortSlicer }: Props) {
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
  // Tweede en derde slicer staan samen in het filtermenu rechtsboven (multiselect,
  // leeg = geen filter): controller, en — alleen op aanvragen/offertes — de soort
  // (servicedesk-dossiers vs. reguliere projecten).
  const [geselecteerdeControllers, setGeselecteerdeControllers] = React.useState<string[]>([])
  const [soorten, setSoorten] = React.useState<SoortKeuze[]>([])
  const [filterOpen, setFilterOpen] = React.useState(false)
  const filterRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!filterOpen) return
    function bijKlik(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    function bijToets(e: KeyboardEvent) {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('mousedown', bijKlik)
    document.addEventListener('keydown', bijToets)
    return () => {
      document.removeEventListener('mousedown', bijKlik)
      document.removeEventListener('keydown', bijToets)
    }
  }, [filterOpen])

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

  function toggleSoort(keuze: SoortKeuze) {
    setSoorten(prev =>
      prev.includes(keuze) ? prev.filter(s => s !== keuze) : [...prev, keuze]
    )
  }

  function toggleController(naam: string) {
    setGeselecteerdeControllers(prev =>
      prev.includes(naam) ? prev.filter(n => n !== naam) : [...prev, naam]
    )
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

  const uniekeControllers = React.useMemo(
    () => [...new Set(dossiers.map(d => d.controller_naam).filter((n): n is string => !!n))].sort(),
    [dossiers],
  )

  const kleurPerController = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of dossiers) {
      if (d.controller_naam && d.controller_kleur && !map[d.controller_naam]) {
        map[d.controller_naam] = d.controller_kleur
      }
    }
    return map
  }, [dossiers])

  const aantalPerController = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of dossiers) {
      if (d.intern || !d.controller_naam) continue
      map[d.controller_naam] = (map[d.controller_naam] ?? 0) + 1
    }
    return map
  }, [dossiers])

  // Aantallen per soort (interne dossiers tellen niet mee — die staan al in de Intern-popup).
  const soortAantallen = React.useMemo(() => {
    let servicedesk = 0
    let project = 0
    for (const d of dossiers) {
      if (d.intern) continue
      if (isServicedeskDossier(d)) servicedesk += 1
      else project += 1
    }
    return { servicedesk, project }
  }, [dossiers])

  // Gefilterde dossiers: soort, personen-slicer (of "Niet toegewezen") én controller.
  const gefilterdeDossiers = React.useMemo(() => {
    return dossiers.filter(d => {
      if (soorten.length > 0
        && !soorten.includes(isServicedeskDossier(d) ? 'servicedesk' : 'project')) {
        return false
      }
      if (alleenNietToegewezen) {
        if (persoonsNaamVoorFilter(d) != null) return false
      } else if (geselecteerdeLeiders.length > 0
        && !geselecteerdeLeiders.includes(persoonsNaamVoorFilter(d) ?? '')) {
        return false
      }
      if (geselecteerdeControllers.length > 0
        && !geselecteerdeControllers.includes(d.controller_naam ?? '')) {
        return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossiers, geselecteerdeLeiders, alleenNietToegewezen, geselecteerdeControllers, soorten, sectie])

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
  const toontPersonen = uniekePLs.length >= 2 || geselecteerdeLeiders.length > 0 || heeftNietToegewezen || alleenNietToegewezen
  const toontControllers = uniekeControllers.length >= 1
  // Soort-filter alleen tonen als er daadwerkelijk iets te scheiden valt (beide soorten aanwezig),
  // of als er al op soort gefilterd wordt (zodat je de keuze kunt terugdraaien).
  const toontSoort = !!toonSoortSlicer
    && (soorten.length > 0 || (soortAantallen.servicedesk > 0 && soortAantallen.project > 0))

  // Soort + controller zitten samen onder één knop rechtsboven; de personen-chips
  // blijven links staan omdat je daar het vaakst op wisselt.
  const aantalActieveFilters = soorten.length + geselecteerdeControllers.length
  const toontFilterMenu = toontSoort || toontControllers

  const filterMenu = toontFilterMenu ? (
    <div ref={filterRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        onClick={() => setFilterOpen(o => !o)}
        title="Filter op soort en controller"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          borderRadius: 99,
          border: `1.5px solid ${aantalActieveFilters > 0 ? 'var(--brand-600)' : 'var(--border)'}`,
          background: aantalActieveFilters > 0 ? 'var(--brand-50)' : 'transparent',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
          color: aantalActieveFilters > 0 ? 'var(--brand-600)' : 'var(--neutral-500)',
          transition: 'all 0.12s',
        }}
      >
        <IconTrechter />
        Filteren
        {aantalActieveFilters > 0 && (
          <span style={{
            minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99,
            display: 'inline-grid', placeItems: 'center',
            background: 'var(--brand-600)', color: '#fff',
            fontSize: 10, fontWeight: 700, lineHeight: 1,
          }}>
            {aantalActieveFilters}
          </span>
        )}
      </button>

      {filterOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          minWidth: 230, maxHeight: 360, overflowY: 'auto',
          background: 'var(--bg-elev, white)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          padding: 6, zIndex: 500,
        }}>
          {toontSoort && (
            <>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                textTransform: 'uppercase', color: 'var(--neutral-400)',
                padding: '4px 8px 2px',
              }}>
                Soort
              </div>
              {(['project', 'servicedesk'] as SoortKeuze[]).map(keuze => (
                <FilterRij
                  key={keuze}
                  actief={soorten.includes(keuze)}
                  kleur={SOORT_KLEUR[keuze]}
                  label={SOORT_LABEL[keuze]}
                  aantal={soortAantallen[keuze]}
                  onClick={() => toggleSoort(keuze)}
                />
              ))}
            </>
          )}

          {toontSoort && toontControllers && (
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
          )}

          {toontControllers && (
            <>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                textTransform: 'uppercase', color: 'var(--neutral-400)',
                padding: '4px 8px 2px',
              }}>
                Controller
              </div>
              {uniekeControllers.map(naam => (
                <FilterRij
                  key={naam}
                  actief={geselecteerdeControllers.includes(naam)}
                  kleur={kleurPerController[naam] ?? crewKleur(crewInitialen(naam))}
                  label={naam}
                  aantal={aantalPerController[naam] ?? 0}
                  initialen={crewInitialen(naam)}
                  onClick={() => toggleController(naam)}
                />
              ))}
            </>
          )}

          {aantalActieveFilters > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
              <button
                onClick={() => { setSoorten([]); setGeselecteerdeControllers([]) }}
                style={{
                  width: '100%', padding: '5px 8px', borderRadius: 6,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, color: 'var(--neutral-500)', textAlign: 'left',
                }}
              >
                Filters wissen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  ) : null

  const slicerBalk = (toontFilterMenu || toontPersonen) ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {toontPersonen && uniekePLs.map(naam => {
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
      {toontPersonen && (heeftNietToegewezen || alleenNietToegewezen) && (
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
      {(geselecteerdeLeiders.length > 0 || alleenNietToegewezen || aantalActieveFilters > 0) && (
        <button
          onClick={() => {
            setGeselecteerdeLeiders([])
            setAlleenNietToegewezen(false)
            setGeselecteerdeControllers([])
            setSoorten([])
          }}
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

      {filterMenu}
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
