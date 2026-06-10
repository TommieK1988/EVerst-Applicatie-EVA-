'use client'

import { Toaster } from 'react-hot-toast'

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f8fafc',
          borderRadius: '0.75rem',
          fontSize: '0.875rem',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: '#f8fafc',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#f8fafc',
          },
        },
      }}
    />
  )
}
