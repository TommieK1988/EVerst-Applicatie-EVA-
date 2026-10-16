/**
 * De kolommen van Offertes → Lijst. De Lijst gebruikt de algemene DossierLijst; hier passen we
 * de kolommen aan voor de offertebewaking, zodat Lijst, Bord en Te doen hetzelfde zeggen:
 *  - "Fase" in de vier fases van het bord; de oude zeven substatussen blijven beschikbaar
 *    als extra kolom "Substatus";
 *  - standaard ook status, volgende stap en eigenaar;
 *  - de kolom over Bouw7-afwijkingen heette "Bewaking" en heet nu "Bouw7-afwijking".
 */

import { cn } from '@everts/ui'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { DossierRij } from '@/components/dossiers/types'
import { OFFERTE_BORD_KOLOMMEN, offerteBordKolom } from '@/components/dossiers/offerte-bord'
import { STATUS_PRESENTATIE } from '@/lib/commercie/types'
import { STIL_REDEN_LABEL, alsStilReden, OPVOLGING_KEUZES } from '@/lib/commercie/opvolging'
import type { Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'
import { kortDatum, maakTeDoenRij, BAK_INDEX } from './te-doen'

const STATUS_VOLGORDE = ['verlopen', 'nu', 'ongetrieerd', 'op_schema', 'wacht_klant', 'wacht_intern', 'wacht_extern', 'slapend', 'afgerond']

function substatus(d: DossierRij): string {
  return d.hoofdstatus === 'opdracht' ? 'gewonnen' : d.offerte_substatus ?? ''
}

export function offerteLijstKolommen(
  basis: KolomDefinitie<DossierRij>[],
  ctx: { vandaag: string; grenzen?: Bedragklassegrenzen },
): KolomDefinitie<DossierRij>[] {
  const rij = (d: DossierRij) => maakTeDoenRij(d, ctx.vandaag, ctx.grenzen)
  const faseLabel = (d: DossierRij) =>
    OFFERTE_BORD_KOLOMMEN.find(k => k.key === offerteBordKolom(substatus(d)))?.label ?? substatus(d)

  const nieuw: KolomDefinitie<DossierRij>[] = [
    {
      key: 'offertefase',
      label: 'Fase',
      breedte: 150,
      filterType: 'select',
      filterOpties: OFFERTE_BORD_KOLOMMEN.map(k => k.label),
      filterWaarde: faseLabel,
      sorteerWaarde: d => OFFERTE_BORD_KOLOMMEN.findIndex(k => k.key === offerteBordKolom(substatus(d))),
      render: d => <span className="text-xs text-neutral-700">{faseLabel(d)}</span>,
    },
    {
      key: 'bewaking_status',
      label: 'Status',
      breedte: 160,
      filterType: 'select',
      filterOpties: STATUS_VOLGORDE.map(s => STATUS_PRESENTATIE[s as keyof typeof STATUS_PRESENTATIE].label),
      filterWaarde: d => STATUS_PRESENTATIE[rij(d)._status].label,
      sorteerWaarde: d => STATUS_VOLGORDE.indexOf(rij(d)._status),
      render: d => {
        const p = STATUS_PRESENTATIE[rij(d)._status]
        return (
          <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold', p.badge)}>
            <span className={cn('h-2 w-2 rounded-full', p.stip)} aria-hidden />
            {p.label}
          </span>
        )
      },
    },
    {
      key: 'volgende_stap',
      label: 'Volgende stap · aan zet',
      breedte: 280,
      filterType: 'tekst',
      sorteerWaarde: d => {
        const r = rij(d)
        return (BAK_INDEX.get(r._bak) ?? 9) * 100_000 + (r._dagen ?? 9_999)
      },
      filterWaarde: d => [d.bewaking_stap_tekst, d.bewaking_actiehouder].filter(Boolean).join(' '),
      render: d => {
        const r = rij(d)
        if (!r._stap) return <span className="text-xs text-neutral-400">Nog niets afgesproken</span>
        return (
          <span className="block min-w-0 text-xs">
            <span className={cn('block truncate', r._status === 'verlopen' ? 'font-semibold text-error-700' : 'text-neutral-800')}>{r._stap}</span>
            {d.bewaking_actiehouder && <span className="block truncate text-neutral-500">{d.bewaking_actiehouder}</span>}
          </span>
        )
      },
    },
    {
      key: 'eigenaar',
      label: 'Eigenaar',
      breedte: 140,
      filterType: 'tekst',
      sorteerWaarde: d => d.bewaking_eigenaar ?? '',
      render: d => d.bewaking_eigenaar
        ? <span className="text-xs text-neutral-700">{d.bewaking_eigenaar}</span>
        : <span className="text-xs text-neutral-400">—</span>,
    },
    {
      key: 'stil_reden',
      label: 'Stil omdat',
      breedte: 180,
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: Object.values(STIL_REDEN_LABEL),
      filterWaarde: d => { const r = alsStilReden(d.bewaking_stil_reden); return r ? STIL_REDEN_LABEL[r] : null },
      sorteerWaarde: d => d.bewaking_stil_reden ?? '',
      render: d => { const r = alsStilReden(d.bewaking_stil_reden); return <span className="text-xs text-neutral-700">{r ? STIL_REDEN_LABEL[r] : '—'}</span> },
    },
    {
      key: 'besluit_datum',
      label: 'Besluit klant',
      breedte: 120,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.bewaking_besluit_datum ?? '',
      render: d => <span className="text-xs text-neutral-700">{d.bewaking_besluit_datum ? kortDatum(d.bewaking_besluit_datum, ctx.vandaag) : '—'}</span>,
    },
    {
      key: 'belronde',
      label: 'In de belronde',
      breedte: 130,
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: ['Op bedrag: ja', 'Op bedrag: nee', 'Altijd', 'Nooit'],
      filterWaarde: d => belrondeLabel(rij(d)),
      sorteerWaarde: d => belrondeLabel(rij(d)),
      render: d => <span className="text-xs text-neutral-700">{belrondeLabel(rij(d))}</span>,
    },
  ]

  const uit: KolomDefinitie<DossierRij>[] = []
  for (const k of basis) {
    if (k.key === 'status') {
      // De vier fases van het bord vooraan; de oude substatus als extra kolom.
      uit.push(...nieuw.slice(0, 4))
      uit.push({ ...k, label: 'Substatus', standaard_zichtbaar: false })
      continue
    }
    if (k.key === 'deadline') { uit.push({ ...k, standaard_zichtbaar: false }); continue }
    if (k.key === 'bewaking') { uit.push({ ...k, label: 'Bouw7-afwijking' }); continue }
    uit.push(k)
    if (k.key === 'bedrag') uit.push(...nieuw.slice(4))
  }
  return uit
}

function belrondeLabel(r: ReturnType<typeof maakTeDoenRij>): string {
  if (r.bewaking_opvolging === 'altijd') return OPVOLGING_KEUZES[1].label
  if (r.bewaking_opvolging === 'niet') return OPVOLGING_KEUZES[2].label
  return r._nabellen ? 'Op bedrag: ja' : 'Op bedrag: nee'
}
