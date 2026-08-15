export type VideoEmbedKind = 'youtube' | 'instagram' | 'unknown'

export interface ParsedVideoUrl {
  kind: VideoEmbedKind
  canonicalUrl: string
  embedUrl?: string
  videoId?: string
}

function stripTrackingParams(url: URL) {
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function parseVideoUrl(raw: string): ParsedVideoUrl | null {
  const input = raw.trim()
  if (!input) return null

  try {
    const parsed = new URL(input)
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '')

    if (host === 'youtube.com') {
      let id = parsed.searchParams.get('v') || undefined
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (!id && parts[0] === 'shorts' && parts[1]) id = parts[1]
      if (!id && parts[0] === 'embed' && parts[1]) id = parts[1]
      if (!id && parts[0] === 'live' && parts[1]) id = parts[1]
      if (id) {
        return {
          kind: 'youtube',
          canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          videoId: id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        }
      }
    }

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      if (id) {
        return {
          kind: 'youtube',
          canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          videoId: id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        }
      }
    }

    if (host === 'instagram.com') {
      const match = parsed.pathname.match(/^\/(reel|p|tv)\/([^/?#]+)/i)
      if (match) {
        const canonicalUrl = `https://www.instagram.com/${match[1]}/${match[2]}/`
        return { kind: 'instagram', canonicalUrl }
      }
    }

    return { kind: 'unknown', canonicalUrl: stripTrackingParams(parsed) }
  } catch {
    return null
  }
}

export function hasEmbeddableVideoPreview(raw: string): boolean {
  const parsed = parseVideoUrl(raw)
  return parsed?.kind === 'youtube' || parsed?.kind === 'instagram'
}
