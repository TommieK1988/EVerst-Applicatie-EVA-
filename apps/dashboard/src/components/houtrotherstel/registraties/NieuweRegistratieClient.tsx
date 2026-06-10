'use client'

import { useState, useEffect } from 'react'
import RegistratieFormulier from '@/components/houtrotherstel/registraties/RegistratieFormulier'
import { getAllProjecten, getAllBibliotheekActief } from '@/lib/houtrotherstel/local-store'

interface Props {
  defaultProjectId?: string
}

export default function NieuweRegistratieClient({ defaultProjectId }: Props) {
  const [projecten, setProjecten] = useState<any[]>([])
  const [standaardReparaties, setStandaardReparaties] = useState<any[]>([])

  useEffect(() => {
    setProjecten(getAllProjecten().map(p => ({
      id: p.id,
      name: p.name,
      project_number: p.project_number,
    })))
    setStandaardReparaties(getAllBibliotheekActief().map(r => ({
      id: r.id, code: r.code, name: r.name, category: r.category,
      labor_hours: r.labor_hours, labor_rate: r.labor_rate, labor_cost: r.labor_cost,
      material_cost: r.material_cost, cost_price: r.cost_price, sale_price: r.sale_price,
      description: r.description,
    })))
  }, [])

  return (
    <RegistratieFormulier
      userId=""
      projecten={projecten}
      standaardReparaties={standaardReparaties}
      defaultProjectId={defaultProjectId}
    />
  )
}
