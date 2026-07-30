'use client'

import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { heeftLegacyCalculatieData, neemLegacyCalculatieDataOver } from '@/lib/everts-calc/legacy-overname'

/**
 * Tilt calculatie-/meetstaatdata die nog in localStorage van deze browser staat
 * eenmalig naar Supabase. Rendert niets. Doet niets als er niets (meer) staat, dus
 * na de eerste geslaagde overname is dit een no-op van één localStorage-lookup.
 */
export default function LegacyDataOvername() {
  useEffect(() => {
    if (!heeftLegacyCalculatieData()) return
    let actief = true
    neemLegacyCalculatieDataOver()
      .then(({ projecten, meetstaten, overgeslagen }) => {
        if (!actief) return
        const overgezet = [
          projecten > 0 ? `${projecten} calculatie${projecten === 1 ? '' : 's'}` : null,
          meetstaten > 0 ? `${meetstaten} meetsta${meetstaten === 1 ? 'at' : 'ten'}` : null,
        ].filter(Boolean).join(' en ')

        if (overgezet) {
          toast.success(`${overgezet} van dit apparaat overgezet naar EVA — nu overal zichtbaar.`, { duration: 8000 })
        }
        if (overgeslagen > 0) {
          toast(
            `${overgeslagen} oude ${overgeslagen === 1 ? 'calculatie hoorde' : 'calculaties hoorden'} bij een project dat niet meer in EVA bestaat. ` +
            'Die zijn overgeslagen en apart bewaard in deze browser.',
            { duration: 9000, icon: 'ℹ️' },
          )
        }
      })
      .catch(() => {
        // Sleutels blijven staan; een volgende sessie probeert het opnieuw.
        toast.error(
          'Oude calculatiegegevens van dit apparaat konden niet worden overgezet. ' +
          'Ze blijven bewaard; probeer het later opnieuw.',
          { duration: 8000 },
        )
      })
    return () => { actief = false }
  }, [])

  return null
}
