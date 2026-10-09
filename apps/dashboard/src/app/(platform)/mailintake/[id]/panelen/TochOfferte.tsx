'use client'

/**
 * "Hoort dit toch bij een offerte van ons?"
 *
 * Bij regie maakt EVA een nieuw dossier: de prijs staat niet vast, dus er is geen
 * aanneemsom om te winnen. Soms is zo'n bon tóch het akkoord op een offerte -- dan
 * hoort dat te kunnen, maar niet als standaard. Vandaar een uitklapblok, alleen als
 * er ook werkelijk een offerte bij past. Stond eerst in het behandelscherm zelf.
 */

import React from 'react'

import OpdrachtPaneel from './OpdrachtPaneel'
import { klein } from './velden'

type OpdrachtProps = React.ComponentProps<typeof OpdrachtPaneel>

export default function TochOfferte({ open, setOpen, isRegie, ...paneel }: {
  open: boolean
  setOpen: (v: boolean) => void
  isRegie: boolean
} & OpdrachtProps) {
  return (
    <details
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
      style={{
        border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
        background: 'var(--surface)',
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        Hoort dit toch bij een offerte van ons?
      </summary>
      <p style={{ ...klein, margin: '8px 0 12px' }}>
        {isRegie
          ? 'Deze opdracht wordt op nacalculatie afgerekend, dus EVA maakt er een nieuw dossier van. Blijkt het tóch het akkoord op een offerte, dan zet je die hier op gewonnen.'
          : 'EVA stelt een nieuw dossier voor. Hoort deze opdracht bij een offerte die wij al hebben uitgebracht, zet die dan hier op gewonnen.'}
      </p>
      <OpdrachtPaneel {...paneel} />
    </details>
  )
}
