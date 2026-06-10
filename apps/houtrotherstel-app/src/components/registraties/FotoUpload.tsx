'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Camera, Upload, X, Loader2, ZoomIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatFileSize } from '@/lib/utils'

interface FotoUploadProps {
  registratieId: string
  initialPhotos?: Array<{
    id: string
    photo_type: 'voor' | 'tijdens' | 'na'
    storage_path: string
    file_name: string
  }>
  readonly?: boolean
}

type FotoType = 'voor' | 'tijdens' | 'na'

const FOTO_TYPES: { value: FotoType; label: string; color: string }[] = [
  { value: 'voor', label: 'Vóór herstel', color: 'border-red-200 bg-red-50' },
  { value: 'tijdens', label: 'Tijdens herstel', color: 'border-yellow-200 bg-yellow-50' },
  { value: 'na', label: 'Na herstel', color: 'border-green-200 bg-green-50' },
]

interface UploadedPhoto {
  id?: string
  photo_type: FotoType
  storage_path: string
  file_name: string
  publicUrl: string
}

export default function FotoUpload({
  registratieId,
  initialPhotos = [],
  readonly = false,
}: FotoUploadProps) {
  const supabase = createClient()
  const [photos, setPhotos] = useState<UploadedPhoto[]>(() => {
    return initialPhotos.map((p) => ({
      id: p.id,
      photo_type: p.photo_type,
      storage_path: p.storage_path,
      file_name: p.file_name,
      publicUrl: supabase.storage.from('htr-repair-photos').getPublicUrl(p.storage_path).data.publicUrl,
    }))
  })
  const [uploading, setUploading] = useState<FotoType | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileInputRefs = {
    voor: useRef<HTMLInputElement>(null),
    tijdens: useRef<HTMLInputElement>(null),
    na: useRef<HTMLInputElement>(null),
  }

  const handleUpload = async (files: FileList | null, fotoType: FotoType) => {
    if (!files || files.length === 0) return

    setUploading(fotoType)

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is te groot (max 10 MB)`)
        continue
      }

      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext || '')) {
        toast.error(`${file.name}: alleen JPG, PNG, WEBP of HEIC toegestaan`)
        continue
      }

      const fileName = `${registratieId}/${fotoType}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

      try {
        const { error: uploadError } = await supabase.storage
          .from('htr-repair-photos')
          .upload(fileName, file, { cacheControl: '3600', upsert: false })

        if (uploadError) throw uploadError

        const { error: dbError } = await supabase.from('repair_photos').insert({
          registration_id: registratieId,
          photo_type: fotoType,
          storage_path: fileName,
          file_name: file.name,
        })

        if (dbError) throw dbError

        const { data: urlData } = supabase.storage
          .from('htr-repair-photos')
          .getPublicUrl(fileName)

        setPhotos((prev) => [
          ...prev,
          {
            photo_type: fotoType,
            storage_path: fileName,
            file_name: file.name,
            publicUrl: urlData.publicUrl,
          },
        ])

        toast.success(`${file.name} geüpload`)
      } catch (error: any) {
        toast.error(`Upload mislukt: ${error.message}`)
      }
    }

    setUploading(null)
  }

  const handleDelete = async (photo: UploadedPhoto) => {
    if (!confirm('Foto verwijderen?')) return

    try {
      await supabase.storage.from('htr-repair-photos').remove([photo.storage_path])

      if (photo.id) {
        await supabase.from('repair_photos').delete().eq('id', photo.id)
      }

      setPhotos((prev) =>
        prev.filter((p) => p.storage_path !== photo.storage_path)
      )

      toast.success('Foto verwijderd')
    } catch {
      toast.error('Verwijderen mislukt')
    }
  }

  return (
    <div className="space-y-6">
      {FOTO_TYPES.map(({ value, label, color }) => {
        const typePhotos = photos.filter((p) => p.photo_type === value)
        const isUploading = uploading === value

        return (
          <div key={value}>
            <div className={`rounded-xl border-2 ${color} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
                {!readonly && (
                  <>
                    <input
                      ref={fileInputRefs[value]}
                      type="file"
                      accept="image/*,.heic"
                      multiple
                      className="hidden"
                      onChange={(e) => handleUpload(e.target.files, value)}
                      capture="environment"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs[value].current?.click()}
                      disabled={isUploading}
                      className="inline-flex items-center gap-1.5 text-xs font-medium
                        bg-white border border-slate-300 hover:border-slate-400 text-slate-700
                        px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      {isUploading ? 'Uploaden...' : 'Foto toevoegen'}
                    </button>
                  </>
                )}
              </div>

              {typePhotos.length === 0 ? (
                !readonly ? (
                  <button
                    type="button"
                    onClick={() => fileInputRefs[value].current?.click()}
                    className="w-full py-8 border-2 border-dashed border-current/30 rounded-lg
                      flex flex-col items-center gap-2 text-slate-400 hover:text-slate-600
                      hover:border-slate-400 transition-colors"
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-xs">Klik of sleep foto&apos;s hier</span>
                    <span className="text-xs opacity-70">JPG, PNG, WEBP, HEIC · max 10 MB</span>
                  </button>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">Geen foto&apos;s</p>
                )
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {typePhotos.map((photo, idx) => (
                    <div key={idx} className="relative group aspect-square">
                      <Image
                        src={photo.publicUrl}
                        alt={photo.file_name}
                        fill
                        className="object-cover rounded-lg"
                        sizes="100px"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40
                        rounded-lg transition-all flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setLightbox(photo.publicUrl)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center
                            opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <ZoomIn className="w-3.5 h-3.5 text-slate-700" />
                        </button>
                        {!readonly && (
                          <button
                            type="button"
                            onClick={() => handleDelete(photo)}
                            className="w-7 h-7 bg-white rounded-full flex items-center justify-center
                              opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="w-3.5 h-3.5 text-red-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {!readonly && (
                    <button
                      type="button"
                      onClick={() => fileInputRefs[value].current?.click()}
                      className="aspect-square border-2 border-dashed border-slate-300
                        rounded-lg flex items-center justify-center text-slate-400
                        hover:border-blue-400 hover:text-everts transition-colors"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              className="absolute top-2 right-2 w-8 h-8 bg-white rounded-full flex items-center
                justify-center text-slate-700 hover:bg-slate-100 z-10"
              onClick={() => setLightbox(null)}
            >
              <X className="w-4 h-4" />
            </button>
            <Image
              src={lightbox}
              alt="Foto vergroot"
              width={1200}
              height={800}
              className="rounded-lg object-contain max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
