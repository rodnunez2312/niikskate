<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const { language } = useI18n()

interface NewsItem {
  id: string
  title: string
  content: string
  excerpt: string
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
const selectedArticle = ref<NewsItem | null>(null)
const showArticleModal = ref(false)

onMounted(async () => {
  await Promise.all([fetchNews(), fetchSocialAccounts()])
})

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
  const labels: Record<string, { es: string, en: string }> = {
    announcement: { es: 'Anuncio', en: 'Announcement' },
    event: { es: 'Evento', en: 'Event' },
    tips: { es: 'Tips', en: 'Tips' },
    community: { es: 'Comunidad', en: 'Community' },
    general: { es: 'General', en: 'General' },
  }
  return labels[category]?.[language.value] || category
}

const getSocialIcon = (platform: string) => {
  const icons: Record<string, string> = {
    instagram: '📸',
    facebook: '📘',
    youtube: '🎬',
    tiktok: '🎵',
  }
  return icons[platform] || '🔗'
}

const getSocialColor = (platform: string) => {
  const colors: Record<string, string> = {
    instagram: 'from-purple-500 via-pink-500 to-orange-500',
    facebook: 'from-blue-600 to-blue-700',
    youtube: 'from-red-600 to-red-700',
    tiktok: 'from-black to-gray-900',
  }
  return colors[platform] || 'from-gray-600 to-gray-700'
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-4 pt-safe pb-6">
      <div class="max-w-lg mx-auto pt-4">
        <div class="flex items-center gap-3 mb-2">
          <NuxtLink to="/profile" class="p-2 -ml-2 hover:bg-white/10 rounded-lg">
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
    </header>

    <div class="px-4 max-w-lg mx-auto pb-24">
      <!-- Social Media Links -->
      <div v-if="socialAccounts.length > 0" class="mb-6">
        <h2 class="text-white font-bold mb-3 flex items-center gap-2">
          <span>📱</span>
          {{ language === 'es' ? 'Síguenos' : 'Follow Us' }}
        </h2>
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
              <p class="font-bold text-white capitalize">{{ account.platform }}</p>
              <p class="text-white/70 text-sm">@{{ account.account_name }}</p>
            </div>
          </a>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="bg-gray-900 rounded-xl p-4 animate-pulse">
          <div class="h-40 bg-gray-800 rounded-lg mb-3"></div>
          <div class="h-4 bg-gray-800 rounded w-3/4 mb-2"></div>
          <div class="h-3 bg-gray-800 rounded w-1/2"></div>
        </div>
      </div>

      <!-- Featured News -->
      <div v-else-if="featuredNews.length > 0" class="mb-6">
        <h2 class="text-white font-bold mb-3 flex items-center gap-2">
          <span>⭐</span>
          {{ language === 'es' ? 'Destacado' : 'Featured' }}
        </h2>
        <div
          v-for="article in featuredNews"
          :key="article.id"
          @click="openArticle(article)"
          class="bg-gradient-to-br from-gold-400/20 to-glass-orange/10 border border-gold-400/30 rounded-xl overflow-hidden mb-4 cursor-pointer hover:border-gold-400/50 transition-all"
        >
          <div v-if="article.image_url" class="aspect-video bg-gray-800">
            <img :src="article.image_url" :alt="article.title" class="w-full h-full object-cover" />
          </div>
          <div class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <span :class="['px-2 py-0.5 rounded-full text-xs font-bold', getCategoryColor(article.category)]">
                {{ getCategoryLabel(article.category) }}
              </span>
              <span class="text-xs text-gray-500">{{ formatDate(article.publish_date) }}</span>
            </div>
            <h3 class="font-bold text-white text-lg mb-2">{{ article.title }}</h3>
            <p class="text-gray-400 text-sm line-clamp-2">{{ article.excerpt }}</p>
          </div>
        </div>
      </div>

      <!-- Regular News -->
      <div v-if="regularNews.length > 0">
        <h2 class="text-white font-bold mb-3 flex items-center gap-2">
          <span>📰</span>
          {{ language === 'es' ? 'Últimas Noticias' : 'Latest News' }}
        </h2>
        <div class="space-y-3">
          <div
            v-for="article in regularNews"
            :key="article.id"
            @click="openArticle(article)"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-700 transition-all"
          >
            <div class="flex gap-3">
              <div v-if="article.image_url" class="w-20 h-20 rounded-lg bg-gray-800 shrink-0 overflow-hidden">
                <img :src="article.image_url" :alt="article.title" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span :class="['px-2 py-0.5 rounded-full text-[10px] font-bold', getCategoryColor(article.category)]">
                    {{ getCategoryLabel(article.category) }}
                  </span>
                </div>
                <h3 class="font-bold text-white text-sm mb-1 line-clamp-2">{{ article.title }}</h3>
                <p class="text-gray-500 text-xs">{{ formatDate(article.publish_date) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && news.length === 0" class="text-center py-12">
        <div class="text-6xl mb-4">📰</div>
        <h3 class="text-white font-bold text-lg mb-2">
          {{ language === 'es' ? 'No hay noticias aún' : 'No news yet' }}
        </h3>
        <p class="text-gray-500">
          {{ language === 'es' ? 'Pronto publicaremos contenido' : 'Content coming soon' }}
        </p>
      </div>
    </div>

    <!-- Article Modal -->
    <Teleport to="body">
      <div
        v-if="showArticleModal && selectedArticle"
        class="fixed inset-0 bg-black/90 z-50 overflow-y-auto"
      >
        <div class="min-h-screen px-4 py-8">
          <div class="max-w-lg mx-auto">
            <!-- Close button -->
            <button
              @click="showArticleModal = false"
              class="mb-4 p-2 bg-gray-800 rounded-full hover:bg-gray-700"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <!-- Article Content -->
            <article class="bg-gray-900 rounded-2xl overflow-hidden">
              <div v-if="selectedArticle.image_url" class="aspect-video bg-gray-800">
                <img :src="selectedArticle.image_url" :alt="selectedArticle.title" class="w-full h-full object-cover" />
              </div>
              
              <div class="p-6">
                <div class="flex items-center gap-2 mb-3">
                  <span :class="['px-2 py-0.5 rounded-full text-xs font-bold', getCategoryColor(selectedArticle.category)]">
                    {{ getCategoryLabel(selectedArticle.category) }}
                  </span>
                  <span class="text-xs text-gray-500">{{ formatDate(selectedArticle.publish_date) }}</span>
                </div>

                <h1 class="text-2xl font-bold text-white mb-4">{{ selectedArticle.title }}</h1>
                
                <div class="prose prose-invert prose-sm max-w-none">
                  <div v-html="selectedArticle.content.replace(/\n/g, '<br>')"></div>
                </div>

                <!-- Social Links -->
                <div v-if="selectedArticle.instagram_url || selectedArticle.facebook_url" class="mt-6 pt-4 border-t border-gray-800">
                  <p class="text-gray-400 text-sm mb-3">{{ language === 'es' ? 'Ver más en:' : 'See more on:' }}</p>
                  <div class="flex gap-3">
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
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
