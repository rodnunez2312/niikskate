<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
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
    <header class="bg-gradient-to-br from-gold-400/20 via-gray-900 to-gray-900 text-white px-4 pt-safe pb-6">
      <div class="max-w-lg mx-auto pt-4">
        <!-- Logo and Branding -->
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-3xl mb-2">
            🛹
          </div>
          <h1 class="text-2xl font-bold">NiikSkate Academy</h1>
          <p class="text-gray-400 text-sm">{{ language === 'es' ? 'Noticias y Comunidad' : 'News & Community' }}</p>
        </div>
        
        <!-- Auth Buttons for Guests -->
        <div v-if="!user" class="flex gap-3 mb-4">
          <NuxtLink 
            to="/auth/login" 
            class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl text-center"
          >
            {{ language === 'es' ? 'Iniciar Sesión' : 'Sign In' }}
          </NuxtLink>
          <NuxtLink 
            to="/auth/register" 
            class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl text-center border border-gray-700"
          >
            {{ language === 'es' ? 'Registrarse' : 'Sign Up' }}
          </NuxtLink>
        </div>

        <!-- Logged in user nav -->
        <div v-else class="flex gap-3 mb-4">
          <NuxtLink 
            to="/profile" 
            class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl text-center border border-gray-700"
          >
            {{ language === 'es' ? 'Mi Perfil' : 'My Profile' }}
          </NuxtLink>
          <NuxtLink 
            to="/bookings" 
            class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl text-center"
          >
            {{ language === 'es' ? 'Mis Reservas' : 'My Bookings' }}
          </NuxtLink>
        </div>
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

      <template v-else>
        <!-- Featured News -->
        <div v-if="featuredNews.length > 0" class="mb-6">
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
        <div v-if="news.length === 0" class="text-center py-12">
          <div class="text-6xl mb-4">📰</div>
          <h3 class="text-white font-bold text-lg mb-2">
            {{ language === 'es' ? 'Próximamente' : 'Coming Soon' }}
          </h3>
          <p class="text-gray-500 mb-6">
            {{ language === 'es' ? 'Pronto publicaremos noticias y eventos' : 'News and events coming soon' }}
          </p>
          
          <!-- CTA for guests -->
          <div v-if="!user" class="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-6 text-left">
            <h3 class="font-bold text-white mb-4 text-center">
              {{ language === 'es' ? '¿Por qué NiikSkate?' : 'Why NiikSkate?' }}
            </h3>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-2xl">📅</span>
                <div>
                  <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Reserva Fácil' : 'Easy Booking' }}</p>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Agenda tus clases en segundos' : 'Book your classes in seconds' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-2xl">📈</span>
                <div>
                  <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Sigue tu Progreso' : 'Track Progress' }}</p>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Ve tus trucos aprendidos' : 'See your learned tricks' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-2xl">👨‍🏫</span>
                <div>
                  <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Coaches Expertos' : 'Expert Coaches' }}</p>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Aprende de los mejores' : 'Learn from the best' }}</p>
                </div>
              </div>
            </div>
            
            <NuxtLink 
              to="/auth/register" 
              class="block w-full py-3 bg-gold-400 text-black font-bold rounded-xl text-center mt-6"
            >
              {{ language === 'es' ? '¡Comienza Ahora!' : 'Start Now!' }}
            </NuxtLink>
          </div>
        </div>
      </template>
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

                <!-- CTA for guests -->
                <div v-if="!user" class="mt-6 pt-4 border-t border-gray-800">
                  <p class="text-gray-400 text-sm mb-3">{{ language === 'es' ? '¿Quieres aprender a patinar?' : 'Want to learn to skate?' }}</p>
                  <NuxtLink 
                    to="/auth/register" 
                    class="block w-full py-3 bg-gold-400 text-black font-bold rounded-xl text-center"
                  >
                    {{ language === 'es' ? '¡Únete a NiikSkate!' : 'Join NiikSkate!' }}
                  </NuxtLink>
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
