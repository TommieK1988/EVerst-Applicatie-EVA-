/**
 * Groepen service — calculatiestructuur ophalen en als boom opbouwen
 */
import { createClient } from '@/lib/supabase/server'
import type { DbCalculationGroup } from '@/lib/supabase/database.types'

// ─── Type voor boomstructuur ──────────────────────────────────────────────────

export interface GroepBoomNode extends DbCalculationGroup {
  children: GroepBoomNode[]
}

// ─── Data ophalen ─────────────────────────────────────────────────────────────

export async function getGroepen(projectId: string): Promise<DbCalculationGroup[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calculation_groups')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Fout bij ophalen groepen: ${error.message}`)
  return data
}

export async function getGroep(id: string): Promise<DbCalculationGroup | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calculation_groups')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Fout bij ophalen groep: ${error.message}`)
  }
  return data
}

// ─── Boom opbouwen ────────────────────────────────────────────────────────────

export function buildBoom(groepen: DbCalculationGroup[]): GroepBoomNode[] {
  const map = new Map<string, GroepBoomNode>()
  const roots: GroepBoomNode[] = []

  for (const g of groepen) {
    map.set(g.id, { ...g, children: [] })
  }

  for (const node of Array.from(map.values())) {
    if (node.parent_group_id === null) {
      roots.push(node)
    } else {
      const parent = map.get(node.parent_group_id)
      if (parent) {
        parent.children.push(node)
      }
    }
  }

  const sorteer = (nodes: GroepBoomNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
    nodes.forEach(n => sorteer(n.children))
  }
  sorteer(roots)

  return roots
}

// ─── Automatische nummering ───────────────────────────────────────────────────

export function berekeningNummers(groepen: DbCalculationGroup[]): Map<string, string> {
  const nummers = new Map<string, string>()
  const sortedChildren = (parentId: string | null) =>
    groepen
      .filter(g => g.parent_group_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)

  sortedChildren(null).forEach((g1, i) => {
    const n1 = String(i + 1)
    nummers.set(g1.id, n1)
    sortedChildren(g1.id).forEach((g2, j) => {
      const n2 = `${n1}.${j + 1}`
      nummers.set(g2.id, n2)
      sortedChildren(g2.id).forEach((g3, k) => {
        nummers.set(g3.id, `${n2}.${k + 1}`)
      })
    })
  })

  return nummers
}
