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
      .then(({ projecten, meetstaten }) => {
        if (!actief || (projecten === 0 && meetstaten === 0)) return
        const delen = [
          projecten > 0 ? `${projecten} calculatie${projecten === 1 ? '' : 's'}` : null,
          meetstaten > 0 ? `${meetstaten} meetsta${meetstaten === 1 ? 'at' : 'ten'}` : null,
        ].filter(Boolean).join(' en ')
        toast.success(`${delen} van dit apparaat overgezet naar EVA — nu overal zichtbaar.`, { duration: 8000 })
      })
      .catch(() => {
        // Sleutels blijven staan; een volgende sessie probeert het opnieuw.
        toast.error('Oude calculatiegegevens van dit apparaat konden niet worden overgezet. Ze blijven bewaard; probeer het later opnieuw.', { duration: 8000 })
      })
    return () => { actief = false }
  }, [])

  return null
}
