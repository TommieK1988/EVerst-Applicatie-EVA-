import React from 'react'
import type { VideoProvider } from './types'
import { videoEmbedUrl } from '@/lib/toolbox/schema'

/** Responsieve 16:9 video-embed (YouTube-nocookie of Vimeo). */
export default function VideoEmbed({
  provider,
  videoId,
  titel,
}: {
  provider: VideoProvider
  videoId: string
  titel?: string
}) {
  return (
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
      <iframe
        src={videoEmbedUrl(provider, videoId)}
        title={titel || 'Video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )
}
