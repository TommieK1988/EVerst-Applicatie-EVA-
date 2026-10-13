import { describe, it, expect } from 'vitest'
import { isPreviewOmgeving } from './omgeving'

describe('isPreviewOmgeving', () => {
  it('herkent een Vercel-preview', () => {
    expect(isPreviewOmgeving({ VERCEL_ENV: 'preview' })).toBe(true)
  })

  it('is uit op de live site en lokaal', () => {
    expect(isPreviewOmgeving({ VERCEL_ENV: 'production' })).toBe(false)
    expect(isPreviewOmgeving({})).toBe(false)
  })
})
