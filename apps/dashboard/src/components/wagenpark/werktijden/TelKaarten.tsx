'use client'

import React from 'react'
import { Clock, LogOut, Sigma } from 'lucide-react'
import { minutenLabel } from '@/lib/wagenpark/werktijd'

/**
 * De drie totalen boven de tabel. Ze rekenen over de rijen die dóór de
 * zoekbalk en de kolomfilters heen komen, niet over de hele periode: filter je
 * op één medewerker, dan staan hier zijn cijfers.
 *
 * Bewust geen klikbare snelfilters meer. De kolom Soort heeft al een eigen
 * selectiefilter, en twee filtermechanismen naast elkaar leverden een tabel op
 * waarvan je niet meer kon zien waaróm er iets ontbrak.
 */
export type Totalen = {
  dagenLaat: number
  minutenLaat: number
  dagenVroeg: number
  minutenVroeg: number
}

export const LEGE_TOTALEN: Totalen = {
  dagenLaat: 0,
  minutenLaat: 0,
  dagenVroeg: 0,
  minutenVroeg: 0,
}

export default function TelKaarten({ totalen }: { totalen: Totalen }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      <Kaart
        label="Te laat"
        hoofd={minutenLabel(totalen.minutenLaat)}
        sub={`${totalen.dagenLaat} ${totalen.dagenLaat === 1 ? 'dag' : 'dagen'}`}
        icon={Clock}
        kleurBadge="bg-amber-100 text-amber-700"
      />
      <Kaart
        label="Te vroeg weg"
        hoofd={minutenLabel(totalen.minutenVroeg)}
        sub={`${totalen.dagenVroeg} ${totalen.dagenVroeg === 1 ? 'dag' : 'dagen'}`}
        icon={LogOut}
        kleurBadge="bg-violet-100 text-violet-700"
      />
      <Kaart
        label="Totaal"
        hoofd={minutenLabel(totalen.minutenLaat + totalen.minutenVroeg)}
        sub={`${totalen.dagenLaat + totalen.dagenVroeg} regels`}
        icon={Sigma}
        kleurBadge="bg-slate-100 text-slate-600"
      />
    </div>
  )
}

function Kaart({
  label,
  hoofd,
  sub,
  icon: Icon,
  kleurBadge,
}: {
  label: string
  hoofd: string
  sub: string
  icon: React.ElementType
  kleurBadge: string
}) {
  return (
    <div className="rounded-lg p-4 flex items-start gap-3 border border-slate-200 bg-white">
      <span className={`p-1.5 rounded-md ${kleurBadge}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block text-2xl font-semibold text-slate-900">{hoofd}</span>
        <span className="block text-xs text-slate-400">{sub}</span>
      </span>
    </div>
  )
}
