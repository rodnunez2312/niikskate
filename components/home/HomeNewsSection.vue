<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MetaFeedResponse, SocialStorySlide } from '~/types'

const props = withDefaults(
  defineProps<{
    /** Embedded in home/dashboard vs full page with header */
    variant?: 'section' | 'page'
  }>(),
  { variant: 'section' }
)

const client = useSupabaseClient()
const { language } = useI18n()

interface NewsItem {
  id: string
  title: string
  content: string
  excerpt: string
  title_en?: string | null
  content_en?: string | null
  excerpt_en?: string | null
  image_url?: string
  video_url?: string
  category: string
  tags?: string[]
  is_featured: boolean
  instagram_url?: string
  facebook_url?: string
  external_link?: string
  publish_date: string
  created_at: string
}

interface SocialAccount {
  id: string
  platform: string
  account_name: string
  account_url: string
  embed_code?: string
}

const loading = ref(true)
const news = ref<NewsItem[]>([])
const socialAccounts = ref<SocialAccount[]>([])
const metaFeed = ref<MetaFeedResponse>({ instagram: [], facebook: [] })
const selectedArticle = ref<NewsItem | null>(null)
const showArticleModal = ref(false)

onMounted(async () => {
  await Promise.all([fetchNews(), fetchSocialAccounts(), loadMetaFeed()])
})

async function loadMetaFeed() {
  try {
    metaFeed.value = await $fetch<MetaFeedResponse>('/api/social/meta-feed')
  } catch {
    metaFeed.value = { instagram: [], facebook: [] }
  }
}

const fetchNews = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('news_feed')
      .select('*')
      .eq('is_published', true)
      .lte('publish_date', new Date().toISOString())
      .order('publish_date', { ascending: false })
      .limit(20)

    if (error) throw error
    news.value = data || []
  } catch (e) {
    console.error('Error fetching news:', e)
  } finally {
    loading.value = false
  }
}

const fetchSocialAccounts = async () => {
  try {
    const { data, error } = await client
      .from('social_accounts')
      .select('*')
      .eq('is_active', true)
      .order('display_order')

    if (error) throw error
    socialAccounts.value = data || []
  } catch (e) {
    console.error('Error fetching social accounts:', e)
  }
}

const featuredNews = computed(() => news.value.filter(n => n.is_featured))
const regularNews = computed(() => news.value.filter(n => !n.is_featured))

/** Instagram-style strip: news items with media + optional Meta Graph items */
const storySlides = computed((): SocialStorySlide[] => {
  const out: SocialStorySlide[] = []

  for (const n of news.value) {
    const url = n.video_url || n.image_url
    if (!url) continue
    out.push({
      id: `news-${n.id}`,
      source: 'news',
      mediaType: n.video_url ? 'video' : 'image',
      mediaUrl: (n.video_url || n.image_url) as string,
      thumbnailUrl: n.image_url || null,
      title: articleTitle(n),
      caption: articleExcerpt(n) || null,
      permalink: n.instagram_url || n.facebook_url || n.external_link || null,
      at: new Date(n.publish_date).getTime(),
    })
  }

  for (const ig of metaFeed.value.instagram) {
    out.push({
      id: `ig-${ig.id}`,
      source: 'instagram',
      mediaType: ig.mediaType,
      mediaUrl: ig.mediaUrl,
      thumbnailUrl: ig.thumbnailUrl,
      title: language.value === 'es' ? 'Instagram' : 'Instagram',
      caption: ig.caption,
      permalink: ig.permalink,
      at: new Date(ig.timestamp).getTime(),
    })
  }

  for (const fb of metaFeed.value.facebook) {
    out.push({
      id: `fb-${fb.id}`,
      source: 'facebook',
      mediaType: 'image',
      mediaUrl: fb.imageUrl,
      thumbnailUrl: null,
      title: language.value === 'es' ? 'Facebook' : 'Facebook',
      caption: fb.message,
      permalink: fb.permalink,
      at: new Date(fb.createdTime).getTime(),
    })
  }

  return out.sort((a, b) => b.at - a.at).slice(0, 36)
})

const openArticle = (article: NewsItem) => {
  selectedArticle.value = article
  showArticleModal.value = true
}

const formatDate = (date: string) => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(date), 'dd MMM yyyy', { locale })
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    announcement: 'bg-gold-400 text-black',
    event: 'bg-glass-purple text-white',
    tips: 'bg-glass-green text-white',
    community: 'bg-glass-blue text-white',
    general: 'bg-gray-600 text-white',
  }
  return colors[category] || colors.general
}

const getCategoryLabel = (category: string) => {
  const labels: Record<string, { es: string; en: string }> = {
    announcement: { es: 'Anuncio', en: 'Announcement' },
    event: { es: 'Evento', en: 'Event' },
    tips: { es: 'Tips', en: 'Tips' },
    community: { es: 'Comunidad', en: 'Community' },
    general: { es: 'General', en: 'General' },
  }
  return labels[category]?.[language.value] || category
}

/** English columns from DB when set; otherwise Spanish copy */
const articleTitle = (article: NewsItem) => {
  if (language.value === 'en' && article.title_en?.trim()) return article.title_en.trim()
  return article.title
}

const articleExcerpt = (article: NewsItem) => {
  if (language.value === 'en' && article.excerpt_en?.trim()) return article.excerpt_en.trim()
  return article.excerpt
}

const articleContent = (article: NewsItem) => {
  if (language.value === 'en' && article.content_en?.trim()) return article.content_en.trim()
  return article.content
}

const getSocialIcon = (platform: string) => {
  const icons: Record<string, string> = {
    instagram: '📸',
    facebook: '📘',
    youtube: '🎬',
    twitter: '𝕏',
    tiktok: '🎵',
  }
  return icons[platform] || '🔗'
}

const getSocialColor = (platform: string) => {
  const colors: Record<string, string> = {
    instagram: 'from-purple-500 via-pink-500 to-orange-500',
    facebook: 'from-blue-600 to-blue-700',
    youtube: 'from-red-600 to-red-800',
    twitter: 'from-neutral-900 to-black',
    tiktok: 'from-black to-gray-900',
  }
  return colors[platform] || 'from-gray-600 to-gray-700'
}

const socialPlatformLabel = (platform: string) => {
  if (platform === 'twitter') {
    return language.value === 'es' ? 'X (Twitter)' : 'X (Twitter)'
  }
  if (platform === 'youtube') return 'YouTube'
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}
</script>

<template>
  <section id="niik-news" class="scroll-mt-8">
    <div
      v-if="variant === 'page'"
      class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-4 pt-safe pb-6 -mx-4 mb-4"
    >
      <div class="max-w-lg mx-auto pt-4">
        <div class="flex items-center gap-3 mb-2">
          <NuxtLink to="/" class="p-2 -ml-2 hover:bg-white/10 rounded-lg">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </NuxtLink>
          <h1 class="text-2xl font-bold">{{ language === 'es' ? 'Noticias' : 'News' }}</h1>
        </div>
        <p class="text-gray-400 text-sm">
          {{ language === 'es' ? 'Mantente al día con NiikSkate' : 'Stay up to date with NiikSkate' }}
        </p>
      </div>
    </div>

    <div :class="variant === 'section' ? 'max-w-lg mx-auto' : 'max-w-lg mx-auto px-4'">
      <h2
        v-if="variant === 'section'"
        class="text-lg font-bold text-white mb-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 inline-block"
      >
        {{ language === 'es' ? 'Noticias' : 'News' }}
      </h2>

      <NewsStoriesStrip :slides="storySlides" :language="language" />

      <div v-if="socialAccounts.length > 0" class="mb-6">
        <h3 class="text-white font-bold mb-3 flex items-center gap-2">
          <span>📱</span>
          {{ language === 'es' ? 'Síguenos' : 'Follow Us' }}
        </h3>
        <div class="grid grid-cols-2 gap-3">
          <a
            v-for="account in socialAccounts"
            :key="account.id"
            :href="account.account_url"
            target="_blank"
            rel="noopener"
            class="bg-gradient-to-r rounded-xl p-4 flex items-center gap-3 hover:scale-[1.02] transition-transform"
            :class="getSocialColor(account.platform)"
          >
            <span class="text-2xl">{{ getSocialIcon(account.platform) }}</span>
            <div>
              <p class="font-bold text-white">{{ socialPlatformLabel(account.platform) }}</p>
              <p class="text-white/70 text-sm">@{{ account.account_name }}</p>
            </div>
          </a>
        </div>
      </div>

      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="bg-gray-900 rounded-xl p-4 animate-pulse border border-gray-800">
          <div class="h-40 bg-gray-800 rounded-lg mb-3"></div>
          <div class="h-4 bg-gray-800 rounded w-3/4 mb-2"></div>
          <div class="h-3 bg-gray-800 rounded w-1/2"></div>
        </div>
      </div>

      <div v-else-if="featuredNews.length > 0" class="mb-6">
        <h3 class="text-white font-bold mb-3 flex items-center gap-2">
          <span>⭐</span>
          {{ language === 'es' ? 'Destacado' : 'Featured' }}
        </h3>
        <div
          v-for="article in featuredNews"
          :key="article.id"
          class="bg-gradient-to-br from-gold-400/20 to-glass-orange/10 border border-gold-400/30 rounded-xl overflow-hidden mb-4 cursor-pointer hover:border-gold-400/50 transition-all"
          @click="openArticle(article)"
        >
          <div v-if="article.image_url" class="aspect-video bg-gray-800">
            <img :src="article.image_url" :alt="articleTitle(article)" class="w-full h-full object-cover" />
          </div>
          <div class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <span :class="['px-2 py-0.5 rounded-full text-xs font-bold', getCategoryColor(article.category)]">
                {{ getCategoryLabel(article.category) }}
              </span>
              <span class="text-xs text-gray-500">{{ formatDate(article.publish_date) }}</span>
            </div>
            <h3 class="font-bold text-white text-lg mb-2">{{ articleTitle(article) }}</h3>
            <p class="text-gray-400 text-sm line-clamp-2">{{ articleExcerpt(article) }}</p>
          </div>
        </div>
      </div>

      <div v-if="regularNews.length > 0">
        <h3 class="text-white font-bold mb-3 flex items-center gap-2">
          <span>📰</span>
          {{ language === 'es' ? 'Últimas Noticias' : 'Latest News' }}
        </h3>
        <div class="space-y-3">
          <div
            v-for="article in regularNews"
            :key="article.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-700 transition-all"
            @click="openArticle(article)"
          >
            <div class="flex gap-3">
              <div v-if="article.image_url" class="w-20 h-20 rounded-lg bg-gray-800 shrink-0 overflow-hidden">
                <img :src="article.image_url" :alt="articleTitle(article)" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span :class="['px-2 py-0.5 rounded-full text-[10px] font-bold', getCategoryColor(article.category)]">
                    {{ getCategoryLabel(article.category) }}
                  </span>
                </div>
                <h3 class="font-bold text-white text-sm mb-1 line-clamp-2">{{ articleTitle(article) }}</h3>
                <p class="text-gray-500 text-xs">{{ formatDate(article.publish_date) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && news.length === 0" class="text-center py-8">
        <div class="text-5xl mb-3">📰</div>
        <h3 class="text-white font-bold text-lg mb-2">
          {{ language === 'es' ? 'No hay noticias aún' : 'No news yet' }}
        </h3>
        <p class="text-gray-500 text-sm">
          {{ language === 'es' ? 'Pronto publicaremos contenido' : 'Content coming soon' }}
        </p>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="showArticleModal && selectedArticle"
        class="fixed inset-0 bg-black/90 z-[100] overflow-y-auto"
      >
        <div class="min-h-screen px-4 py-8">
          <div class="max-w-lg mx-auto">
            <button
              class="mb-4 p-2 bg-gray-800 rounded-full hover:bg-gray-700"
              @click="showArticleModal = false"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <article class="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
              <div v-if="selectedArticle.image_url" class="aspect-video bg-gray-800">
                <img :src="selectedArticle.image_url" :alt="articleTitle(selectedArticle)" class="w-full h-full object-cover" />
              </div>

              <div class="p-6">
                <div class="flex items-center gap-2 mb-3">
                  <span :class="['px-2 py-0.5 rounded-full text-xs font-bold', getCategoryColor(selectedArticle.category)]">
                    {{ getCategoryLabel(selectedArticle.category) }}
                  </span>
                  <span class="text-xs text-gray-500">{{ formatDate(selectedArticle.publish_date) }}</span>
                </div>

                <h1 class="text-2xl font-bold text-white mb-4">{{ articleTitle(selectedArticle) }}</h1>

                <div class="prose prose-invert prose-sm max-w-none">
                  <div v-html="articleContent(selectedArticle).replace(/\n/g, '<br>')"></div>
                </div>

                <div
                  v-if="selectedArticle.instagram_url || selectedArticle.facebook_url"
                  class="mt-6 pt-4 border-t border-gray-800"
                >
                  <p class="text-gray-400 text-sm mb-3">{{ language === 'es' ? 'Ver más en:' : 'See more on:' }}</p>
                  <div class="flex gap-3 flex-wrap">
                    <a
                      v-if="selectedArticle.instagram_url"
                      :href="selectedArticle.instagram_url"
                      target="_blank"
                      class="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-white text-sm font-bold"
                    >
                      📸 Instagram
                    </a>
                    <a
                      v-if="selectedArticle.facebook_url"
                      :href="selectedArticle.facebook_url"
                      target="_blank"
                      class="px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-bold"
                    >
                      📘 Facebook
                    </a>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
