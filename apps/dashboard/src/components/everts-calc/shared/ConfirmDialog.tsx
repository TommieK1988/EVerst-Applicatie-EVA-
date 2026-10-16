'use client'

import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  destructive?: boolean
  /** Extra inhoud onder de beschrijving, bijvoorbeeld een waarschuwing. */
  children?: ReactNode
  /** Tweede keuze naast de hoofdknop, bijvoorbeeld "Alle regels". */
  extraActie?: { label: string; onClick: () => void }
}

export default function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = 'Bevestigen', onConfirm, destructive = false, children, extraActie,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          {extraActie && (
            <AlertDialogAction variant="secondary" onClick={extraActie.onClick}>
              {extraActie.label}
            </AlertDialogAction>
          )}
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
