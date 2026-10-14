'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, User } from 'lucide-react'
import BottomSheet from '@/components/mobiel/BottomSheet'
import { GRIJS, GROEN, RAND, TEKST, OPPERVLAK, veld } from '@/components/mobiel/commercieel/stijl'

type CollegaOptie = { id: string; naam: string; afdeling: string | null }

/**
 * Balk boven de agenda om de agenda van een collega te openen. Staat er alleen voor wie
 * op mobiel het recht Planning (lezen) heeft; de pagina beslist dat, niet dit component.
 *
 * Wisselen loopt via de URL (`?wie=`), niet via state: de server bepaalt per verzoek of je
 * die agenda mag zien, en een gedeelde of teruggeknopte link opent dezelfde persoon.
 * Filteren gebeurt hier in de browser — het hele bedrijf is een paar tientallen namen.
 */
export default function CollegaKiezer({ collegas, huidig, eigenId }: {
  collegas: CollegaOptie[]
  /** De collega waarvan de agenda nu open staat; null = je eigen agenda. */
  huidig: { id: string; naam: string } | null
  eigenId: string
}) {
  const t = useTranslations('planning')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')

  const treffers = useMemo(() => {
    const q = term.trim().toLowerCase()
    return collegas
      .filter(c => c.id !== eigenId)
      .filter(c => !q || c.naam.toLowerCase().includes(q) || (c.afdeling ?? '').toLowerCase().includes(q))
  }, [collegas, term, eigenId])

  const kies = (id: string | null) => {
    setOpen(false)
    setTerm('')
    router.push(id ? `/m/planning?wie=${id}` : '/m/planning')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '12px 16px', border: 'none', borderBottom: `1px solid ${RAND}`,
          background: OPPERVLAK, color: TEKST, fontSize: 15, fontWeight: 600,
          fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <User size={16} aria-hidden style={{ color: huidig ? GROEN : GRIJS, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {huidig ? t('agendaVan', { naam: huidig.naam }) : t('mijnAgenda')}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: GROEN, flexShrink: 0 }}>{t('collegaKiezen')}</span>
        <ChevronDown size={16} aria-hidden style={{ color: GROEN, flexShrink: 0 }} />
      </button>

      {open && (
        <BottomSheet titel={t('kiezerTitel')} onSluit={() => setOpen(false)} sluitLabel={t('sluiten')}>
          <input
            type="search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder={t('zoekCollega')}
            aria-label={t('zoekCollega')}
            style={{ ...veld, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {huidig && <Regel naam={t('mijnAgenda')} onder={null} onKies={() => kies(null)} />}
            {treffers.map(c => (
              <Regel
                key={c.id}
                naam={c.naam}
                onder={c.afdeling}
                actief={huidig?.id === c.id}
                onKies={() => kies(c.id)}
              />
            ))}
            {treffers.length === 0 && (
              <div style={{ padding: '16px 0', fontSize: 14, color: GRIJS, textAlign: 'center' }}>
                {t('geenCollega')}
              </div>
            )}
          </div>
        </BottomSheet>
      )}
    </>
  )
}

function Regel({ naam, onder, actief = false, onKies }: {
  naam: string
  onder: string | null
  actief?: boolean
  onKies: () => void
}) {
  return (
    <button
      type="button"
      onClick={onKies}
      style={{
        display: 'block', width: '100%', padding: '12px 4px', border: 'none',
        borderBottom: `1px solid ${RAND}`, background: 'transparent', textAlign: 'left',
        fontFamily: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: actief ? 700 : 600, color: actief ? GROEN : TEKST }}>{naam}</div>
      {onder && <div style={{ fontSize: 13, color: GRIJS, marginTop: 2 }}>{onder}</div>}
    </button>
  )
}
