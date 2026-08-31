import { Skeleton } from '@/components/ui'

/**
 * Fallback voor `loading.tsx` van de dossier-overzichten (Aanvragen, Offertes,
 * Opdrachten, Servicedesk, Afgesloten).
 *
 * Zonder deze boundary blijft de browser op de vórige pagina staan tot álle
 * serverdata binnen is — een paar honderd dossiers met hun verrijking duurt
 * makkelijk een seconde, en dat voelt als een hapering in plaats van als laden.
 * Met de boundary verschijnt het bord meteen en streamt de inhoud erin.
 *
 * Vorm volgt bewust het scherm dat erop volgt: een toolbar met zoekveld en knoppen,
 * daaronder kanban-kolommen óf tabelrijen. De borden staan standaard op kanban (zie
 * DossierViewSwitcher); heeft de gebruiker daar lijstweergave gekozen, dan is dit een
 * fractie van een seconde de verkeerde vorm — die keuze staat in localStorage en is
 * op de server niet bekend.
 */
export function DossierOverzichtSkeleton({
  kolommen = 6,
  weergave = 'kanban',
}: {
  kolommen?: number
  weergave?: 'kanban' | 'lijst'
}) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px)', background: 'var(--bg)' }}
      aria-busy="true"
      aria-label="Overzicht wordt geladen"
    >
      {/* Toolbar: zoekveld, teller, knoppen rechts */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        <Skeleton className="h-8 rounded-md" style={{ width: 256 }} />
        <Skeleton className="h-3" style={{ width: 74 }} />
        <div style={{ flex: 1 }} />
        <Skeleton className="h-8 rounded-md" style={{ width: 128 }} />
        <Skeleton className="h-8 rounded-md" style={{ width: 64 }} />
        <Skeleton className="h-8 rounded-md" style={{ width: 132 }} />
      </div>

      {weergave === 'lijst' ? <Tabel /> : <Kolommen aantal={kolommen} />}
    </div>
  )
}

/** Kanban-vorm: kolommen met kop en een paar kaarten. */
function Kolommen({ aantal }: { aantal: number }) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {Array.from({ length: aantal }).map((_, kolom) => (
        <div
          key={kolom}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--border)',
          }}
        >
          {/* Kolomkop */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 14px 10px',
            borderBottom: '2px solid var(--border)',
            flexShrink: 0,
          }}>
            <Skeleton className="rounded-full" style={{ width: 8, height: 8, flexShrink: 0 }} />
            <Skeleton className="h-3" style={{ flex: 1, maxWidth: 108 }} />
            <Skeleton className="rounded-full" style={{ width: 20, height: 20, flexShrink: 0 }} />
          </div>

          {/* Kaarten. Aflopend aantal per kolom: een bord is nooit gelijk gevuld
              en een blok identieke kolommen leest als een tabel. */}
          <div style={{ flex: 1, padding: '10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: Math.max(1, 4 - (kolom % 3)) }).map((_, kaart) => (
              <div
                key={kaart}
                className="rounded-lg border border-neutral-200"
                style={{ padding: 10, background: 'var(--bg-elev)' }}
              >
                <Skeleton className="mb-2 h-2.5" style={{ width: '45%' }} />
                <Skeleton className="mb-1.5 h-3.5" style={{ width: '90%' }} />
                <Skeleton className="mb-3 h-3.5" style={{ width: '65%' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Skeleton className="rounded-full" style={{ width: 18, height: 18 }} />
                  <Skeleton className="h-2.5" style={{ flex: 1, maxWidth: 70 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Lijst-vorm: kolomkoppen met daaronder rijen van gelijke hoogte. */
function Tabel() {
  return (
    <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px' }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', gap: 24, padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)',
        }}>
          {[90, 200, 150, 110, 80, 120].map((breedte, i) => (
            <Skeleton key={i} className="h-2.5" style={{ width: breedte, flexShrink: 0 }} />
          ))}
        </div>
        {Array.from({ length: 12 }).map((_, rij) => (
          <div
            key={rij}
            style={{
              display: 'flex', gap: 24, padding: '11px 14px', alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              background: rij % 2 === 0 ? 'var(--bg)' : 'var(--bg-elev)',
            }}
          >
            {[90, 200, 150, 110, 80, 120].map((breedte, i) => (
              <Skeleton key={i} className="h-3" style={{ width: breedte, flexShrink: 0 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
