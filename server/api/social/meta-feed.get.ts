/**
 * Optional Meta Graph feed for Instagram + Facebook Page.
 * Configure META_INSTAGRAM_USER_TOKEN + META_INSTAGRAM_BUSINESS_ID (and/or Facebook page token + page id)
 * to merge live media into the news "stories" strip. Without env vars, returns empty arrays.
 */

import type {
  MetaFacebookFeedItem,
  MetaFeedResponse,
  MetaInstagramFeedItem,
} from '~/types'

interface IgMediaItem {
  id: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  caption?: string
  timestamp?: string
}

interface FbFeedItem {
  id: string
  message?: string
  created_time?: string
  permalink_url?: string
  full_picture?: string
}

function mapInstagram(row: IgMediaItem): MetaInstagramFeedItem | null {
  const type = (row.media_type || '').toUpperCase()
  if (type === 'CAROUSEL_ALBUM' && !row.media_url && !row.thumbnail_url) {
    return null
  }
  const mediaUrl = row.media_url || row.thumbnail_url
  if (!mediaUrl || !row.permalink || !row.timestamp) return null

  const isVideo = type === 'VIDEO' || type === 'REELS'
  return {
    id: row.id,
    mediaType: isVideo ? 'video' : 'image',
    mediaUrl,
    thumbnailUrl: row.thumbnail_url || null,
    permalink: row.permalink,
    caption: row.caption || null,
    timestamp: row.timestamp,
  }
}

function mapFacebook(row: FbFeedItem): MetaFacebookFeedItem | null {
  if (!row.full_picture || !row.permalink_url || !row.created_time) return null
  return {
    id: row.id,
    imageUrl: row.full_picture,
    permalink: row.permalink_url,
    message: row.message || null,
    createdTime: row.created_time,
  }
}

export default defineEventHandler(async (): Promise<MetaFeedResponse> => {
  const config = useRuntimeConfig()
  const instagram: MetaInstagramFeedItem[] = []
  const facebook: MetaFacebookFeedItem[] = []

  const igToken = config.metaInstagramUserToken as string
  const igUserId = config.metaInstagramBusinessId as string

  if (igToken && igUserId) {
    try {
      const data = await $fetch<{ data?: IgMediaItem[] }>(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          query: {
            fields: 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp',
            limit: '15',
            access_token: igToken,
          },
        }
      )
      for (const row of data.data || []) {
        const mapped = mapInstagram(row)
        if (mapped) instagram.push(mapped)
      }
    } catch (e) {
      console.warn('[meta-feed] Instagram:', e)
    }
  }

  const fbToken = config.metaFacebookPageToken as string
  const fbPageId = config.metaFacebookPageId as string

  if (fbToken && fbPageId) {
    try {
      const data = await $fetch<{ data?: FbFeedItem[] }>(
        `https://graph.facebook.com/v21.0/${fbPageId}/feed`,
        {
          query: {
            fields: 'id,message,created_time,permalink_url,full_picture',
            limit: '12',
            access_token: fbToken,
          },
        }
      )
      for (const row of data.data || []) {
        const mapped = mapFacebook(row)
        if (mapped) facebook.push(mapped)
      }
    } catch (e) {
      console.warn('[meta-feed] Facebook:', e)
    }
  }

  return { instagram, facebook }
})
