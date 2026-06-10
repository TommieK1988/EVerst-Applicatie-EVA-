import { createClient } from '@/lib/houtrotherstel/supabase/client'
import type { Project, ProjectForm, ProjectFilters, ProjectWithStats } from '@/lib/houtrotherstel/types'

export async function getProjects(filters?: ProjectFilters): Promise<ProjectWithStats[]> {
  const supabase = createClient()

  let query = supabase
    .from('projects')
    .select(`
      *,
      repair_registrations(count)
    `)
    .order('created_at', { ascending: false })

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,project_number.ilike.%${filters.search}%,client_name.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return data || []
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function getProjectWithDetails(id: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      project_user_assignments(
        id,
        role_in_project,
        profiles(id, full_name, email, role)
      ),
      repair_registrations(
        id, status, control_status, sale_price_snapshot, actual_sale_price,
        cost_price_snapshot, actual_cost_price, labor_hours_snapshot, actual_labor_hours,
        registration_date, component_type, element_number, room_or_unit, location_block
      )
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createProject(form: ProjectForm, userId: string): Promise<Project> {
  const { saveProject } = await import('@/lib/houtrotherstel/local-store')
  const project: Project = {
    id: `p-${Date.now()}`,
    project_number: form.project_number,
    name: form.name,
    client_name: form.client_name,
    address: form.address,
    postal_code: form.postal_code,
    city: form.city,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    status: form.status,
    description: form.description || null,
    contact_name: form.contact_name || null,
    contact_phone: form.contact_phone || null,
    contact_email: form.contact_email || null,
    notes: form.notes || null,
    photo_url: null,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  saveProject(project)
  return project
}

export async function updateProject(id: string, form: Partial<ProjectForm>): Promise<Project> {
  const { getAllProjecten, saveProject } = await import('@/lib/houtrotherstel/local-store')
  const all = getAllProjecten()
  const existing = all.find(p => p.id === id)
  if (!existing) throw new Error('Project niet gevonden')
  const updated: Project = {
    ...existing,
    ...form,
    start_date: form.start_date ?? existing.start_date,
    end_date: form.end_date ?? existing.end_date,
    updated_at: new Date().toISOString(),
  }
  saveProject(updated)
  return updated
}

export async function deleteProject(id: string): Promise<void> {
  // Alleen localStorage projecten kunnen worden verwijderd
  const { getLocalProjecten } = await import('@/lib/houtrotherstel/local-store')
  const items = getLocalProjecten().filter(p => p.id !== id)
  localStorage.setItem('eve_projecten', JSON.stringify(items))
}

export async function assignUserToProject(
  projectId: string,
  userId: string,
  role?: string
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.from('project_user_assignments').upsert({
    project_id: projectId,
    user_id: userId,
    role_in_project: role,
  })

  if (error) throw new Error(error.message)
}

export async function removeUserFromProject(
  projectId: string,
  userId: string
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('project_user_assignments')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function getProjectStats(projectId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('project_financieel_overzicht')
    .select('*')
    .eq('project_id', projectId)
    .single()

  if (error) return null
  return data
}
