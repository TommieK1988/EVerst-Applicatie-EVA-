'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Save } from 'lucide-react'
import { projectSchema, type ProjectFormValues } from '@/lib/houtrotherstel/validations'
import { createProject, updateProject } from '@/services/houtrotherstel/projects'
import type { Project } from '@/lib/houtrotherstel/types'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'

interface ProjectFormProps {
  project?: Project
  userId?: string
  onSuccess?: (project: Project) => void
}

export default function ProjectForm({ project, userId, onSuccess }: ProjectFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const isEdit = !!project

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      project_number: project?.project_number || '',
      name: project?.name || '',
      client_name: project?.client_name || '',
      address: project?.address || '',
      postal_code: project?.postal_code || '',
      city: project?.city || '',
      start_date: project?.start_date || '',
      end_date: project?.end_date || '',
      status: project?.status || 'actief',
      description: project?.description || '',
      contact_name: project?.contact_name || '',
      contact_phone: project?.contact_phone || '',
      contact_email: project?.contact_email || '',
      notes: project?.notes || '',
    },
  })

  const onSubmit = async (data: ProjectFormValues) => {
    setIsLoading(true)
    try {
      let result: Project
      if (isEdit) {
        result = await updateProject(project!.id, data)
        toast.success('Project bijgewerkt')
      } else {
        result = await createProject(data, userId!)
        toast.success('Project aangemaakt')
      }

      if (onSuccess) {
        onSuccess(result)
      } else {
        router.push(`/houtrotherstel/projecten/${result.id}`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Er is een fout opgetreden')
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm transition-colors
    focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts
    ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-300 hover:border-slate-400'}`

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
  const errorClass = 'mt-1 text-xs text-red-600'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Sectie: Basisinformatie */}
      <Card>
        <CardHeader>Basisinformatie</CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Projectnummer *</label>
              <input {...register('project_number')} className={inputClass(!!errors.project_number)} placeholder="P-2024-001" />
              {errors.project_number && <p className={errorClass}>{errors.project_number.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Status *</label>
              <select {...register('status')} className={inputClass(!!errors.status)}>
                <option value="concept">Concept</option>
                <option value="actief">Actief</option>
                <option value="afgerond">Afgerond</option>
                <option value="gepauzeerd">Gepauzeerd</option>
                <option value="geannuleerd">Geannuleerd</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Projectnaam *</label>
            <input {...register('name')} className={inputClass(!!errors.name)} placeholder="Renovatie Parkweg" />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Opdrachtgever *</label>
            <input {...register('client_name')} className={inputClass(!!errors.client_name)} placeholder="Woningcorporatie De Goede Woning" />
            {errors.client_name && <p className={errorClass}>{errors.client_name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Startdatum</label>
              <input type="date" {...register('start_date')} className={inputClass(false)} />
            </div>
            <div>
              <label className={labelClass}>Einddatum</label>
              <input type="date" {...register('end_date')} className={inputClass(false)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Omschrijving</label>
            <textarea {...register('description')} rows={3} className={inputClass(false)} placeholder="Korte omschrijving van het project..." />
          </div>
        </CardBody>
      </Card>

      {/* Sectie: Locatie */}
      <Card>
        <CardHeader>Locatie</CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className={labelClass}>Adres *</label>
            <input {...register('address')} className={inputClass(!!errors.address)} placeholder="Parkweg 1-48" />
            {errors.address && <p className={errorClass}>{errors.address.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Postcode *</label>
              <input {...register('postal_code')} className={inputClass(!!errors.postal_code)} placeholder="2700 AB" />
              {errors.postal_code && <p className={errorClass}>{errors.postal_code.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Plaats *</label>
              <input {...register('city')} className={inputClass(!!errors.city)} placeholder="Zoetermeer" />
              {errors.city && <p className={errorClass}>{errors.city.message}</p>}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Sectie: Contactpersoon */}
      <Card>
        <CardHeader>Contactpersoon</CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className={labelClass}>Naam contactpersoon</label>
            <input {...register('contact_name')} className={inputClass(false)} placeholder="Jan de Vries" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Telefoonnummer</label>
              <input {...register('contact_phone')} className={inputClass(false)} placeholder="070-1234567" type="tel" />
            </div>
            <div>
              <label className={labelClass}>E-mailadres</label>
              <input {...register('contact_email')} className={inputClass(!!errors.contact_email)} placeholder="contact@opdrachtgever.nl" type="email" />
              {errors.contact_email && <p className={errorClass}>{errors.contact_email.message}</p>}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Notities */}
      <Card>
        <CardHeader>Notities</CardHeader>
        <CardBody>
          <textarea {...register('notes')} rows={3} className={inputClass(false)} placeholder="Interne notities..." />
        </CardBody>
      </Card>

      {/* Acties */}
      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.back()}
        >
          Annuleren
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isLoading}
        >
          <Save className="w-4 h-4" />
          {isEdit ? 'Wijzigingen opslaan' : 'Project aanmaken'}
        </Button>
      </div>
    </form>
  )
}
