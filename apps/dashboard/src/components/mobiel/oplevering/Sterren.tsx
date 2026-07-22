import React from 'react'

/**
 * Sterrenrij met een gedeeltelijk gevulde laatste ster (4,2 van 5 = vier volle sterren plus een
 * vijfde die voor 20% gevuld is).
 *
 * Opgelost met twee lagen over elkaar in plaats van per ster te rekenen: een grijze rij eronder
 * en een gekleurde rij erboven die op breedte wordt afgekapt. Dat leest exact, ook bij een schaal
 * van 7 of 10 sterren.
 */
const GOUD = '#e0a615'
const LEEG = '#dfe4e6'

function Ster({ kleur, maat }: { kleur: string; maat: number }) {
  return (
    <svg width={maat} height={maat} viewBox="0 0 24 24" fill={kleur} aria-hidden style={{ display: 'block' }}>
      <path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5L12 17.3l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
    </svg>
  )
}

export default function Sterren({ score, max, maat = 22 }: {
  score: number
  max: number
  maat?: number
}) {
  // Een schaal van 10 zou tien sterren geven en dat past niet op een telefoon; boven de 5 rekenen
  // we terug naar 5 sterren, zodat de verhouding klopt maar het beeld rustig blijft.
  const aantal = max > 5 ? 5 : Math.max(1, Math.round(max))
  const fractie = max > 0 ? Math.min(1, Math.max(0, score / max)) : 0
  const rij = (kleur: string) => (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: aantal }, (_, i) => <Ster key={i} kleur={kleur} maat={maat} />)}
    </div>
  )

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      role="img"
      aria-label={`${score.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} van ${max}`}
    >
      {rij(LEEG)}
      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%',
        width: `${fractie * 100}%`, overflow: 'hidden',
      }}>
        {rij(GOUD)}
      </div>
    </div>
  )
}
