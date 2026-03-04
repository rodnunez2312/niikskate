<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

interface NewsItem {
  id: string
  title: string
  content: string
  excerpt: string
  image_url?: string
  category: string
  is_published: boolean
  is_featured: boolean
  publish_date: string
  instagram_url?: string
  facebook_url?: string
  created_at: string
}

// Auth check
const isAdmin = ref(false)
const checkingRole = ref(true)

// Data
const news = ref<NewsItem[]>([])
const loading = ref(true)
const showModal = ref(false)
const editingNews = ref<NewsItem | null>(null)
const saving = ref(false)

// Form
const form = ref({
  title: '',
  content: '',
  excerpt: '',
  image_url: '',
  category: 'general',
  is_published: false,
  is_featured: false,
  publish_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  instagram_url: '',
  facebook_url: '',
})

const categories = [
  { value: 'general', label: { es: 'General', en: 'General' } },
  { value: 'announcement', label: { es: 'Anuncio', en: 'Announcement' } },
  { value: 'event', label: { es: 'Evento', en: 'Event' } },
  { value: 'tips', label: { es: 'Tips', en: 'Tips' } },
  { value: 'community', label: { es: 'Comunidad', en: 'Community' } },
]

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/news')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'admin') {
    router.push('/')
    return
  }

  isAdmin.value = true
  checkingRole.value = false
  await fetchNews()
})

const fetchNews = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('news_feed')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    news.value = data || []
  } catch (e) {
    console.error('Error fetching news:', e)
  } finally {
    loading.value = false
  }
}

const openModal = (item?: NewsItem) => {
  if (item) {
    editingNews.value = item
    form.value = {
      title: item.title,
      content: item.content,
      excerpt: item.excerpt || '',
      image_url: item.image_url || '',
      category: item.category,
      is_published: item.is_published,
      is_featured: item.is_featured,
      publish_date: item.publish_date ? format(new Date(item.publish_date), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      instagram_url: item.instagram_url || '',
      facebook_url: item.facebook_url || '',
    }
  } else {
    editingNews.value = null
    form.value = {
      title: '',
      content: '',
      excerpt: '',
      image_url: '',
      category: 'general',
      is_published: false,
      is_featured: false,
      publish_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      instagram_url: '',
      facebook_url: '',
    }
  }
  showModal.value = true
}

const saveNews = async () => {
  saving.value = true
  try {
    const payload = {
      title: form.value.title,
      content: form.value.content,
      excerpt: form.value.excerpt || form.value.content.substring(0, 200),
      image_url: form.value.image_url || null,
      category: form.value.category,
      is_published: form.value.is_published,
      is_featured: form.value.is_featured,
      publish_date: form.value.publish_date,
      instagram_url: form.value.instagram_url || null,
      facebook_url: form.value.facebook_url || null,
      author_id: user.value?.id,
    }

    if (editingNews.value) {
      const { error } = await client
        .from('news_feed')
        .update(payload)
        .eq('id', editingNews.value.id)
      if (error) throw error
    } else {
      const { error } = await client
        .from('news_feed')
        .insert(payload)
      if (error) throw error
    }

    showModal.value = false
    await fetchNews()
  } catch (e) {
    console.error('Error saving news:', e)
  } finally {
    saving.value = false
  }
}

const deleteNews = async (id: string) => {
  if (!confirm(language.value === 'es' ? '¿Eliminar esta noticia?' : 'Delete this news item?')) return
  
  try {
    const { error } = await client
      .from('news_feed')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    await fetchNews()
  } catch (e) {
    console.error('Error deleting news:', e)
  }
}

const togglePublish = async (item: NewsItem) => {
  try {
    const { error } = await client
      .from('news_feed')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    
    if (error) throw error
    await fetchNews()
  } catch (e) {
    console.error('Error toggling publish:', e)
  }
}

const formatDate = (date: string) => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(date), 'dd MMM yyyy HH:mm', { locale })
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Loading -->
    <div v-if="checkingRole" class="min-h-screen flex items-center justify-center">
      <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full"></div>
    </div>

    <template v-else-if="isAdmin">
      <!-- Header -->
      <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-4 pt-safe pb-6">
        <div class="max-w-4xl mx-auto pt-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <NuxtLink to="/admin" class="p-2 -ml-2 hover:bg-white/10 rounded-lg">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </NuxtLink>
              <div>
                <h1 class="text-2xl font-bold">{{ language === 'es' ? 'Gestión de Noticias' : 'News Management' }}</h1>
                <p class="text-gray-400 text-sm">{{ language === 'es' ? 'Crea y administra el blog' : 'Create and manage blog posts' }}</p>
              </div>
            </div>
            <button
              @click="openModal()"
              class="px-4 py-2 bg-gold-400 text-black font-bold rounded-xl hover:bg-gold-500 transition-all"
            >
              + {{ language === 'es' ? 'Nueva Noticia' : 'New Post' }}
            </button>
          </div>
        </div>
      </header>

      <div class="px-4 max-w-4xl mx-auto py-6">
        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3 mb-6">
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-white">{{ news.length }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Total' : 'Total' }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-glass-green">{{ news.filter(n => n.is_published).length }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Publicadas' : 'Published' }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-gold-400">{{ news.filter(n => n.is_featured).length }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Destacadas' : 'Featured' }}</p>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="space-y-3">
          <div v-for="i in 3" :key="i" class="bg-gray-900 rounded-xl p-4 animate-pulse">
            <div class="h-5 bg-gray-800 rounded w-1/2 mb-2"></div>
            <div class="h-4 bg-gray-800 rounded w-3/4"></div>
          </div>
        </div>

        <!-- News List -->
        <div v-else class="space-y-3">
          <div
            v-for="item in news"
            :key="item.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-start gap-4">
              <div v-if="item.image_url" class="w-16 h-16 rounded-lg bg-gray-800 shrink-0 overflow-hidden">
                <img :src="item.image_url" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-bold text-white truncate">{{ item.title }}</h3>
                  <span v-if="item.is_featured" class="text-gold-400 text-sm">⭐</span>
                </div>
                <p class="text-gray-500 text-sm truncate">{{ item.excerpt }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span :class="['px-2 py-0.5 rounded-full text-xs font-bold', item.is_published ? 'bg-glass-green text-white' : 'bg-gray-700 text-gray-400']">
                    {{ item.is_published ? (language === 'es' ? 'Publicada' : 'Published') : (language === 'es' ? 'Borrador' : 'Draft') }}
                  </span>
                  <span class="text-xs text-gray-600">{{ formatDate(item.created_at) }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  @click="togglePublish(item)"
                  class="p-2 rounded-lg hover:bg-gray-800"
                  :class="item.is_published ? 'text-glass-green' : 'text-gray-500'"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                <button
                  @click="openModal(item)"
                  class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  @click="deleteNews(item.id)"
                  class="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="news.length === 0" class="text-center py-12">
            <div class="text-6xl mb-4">📰</div>
            <h3 class="text-white font-bold text-lg mb-2">
              {{ language === 'es' ? 'No hay noticias' : 'No news yet' }}
            </h3>
            <p class="text-gray-500 mb-4">
              {{ language === 'es' ? 'Crea tu primera publicación' : 'Create your first post' }}
            </p>
            <button
              @click="openModal()"
              class="px-6 py-3 bg-gold-400 text-black font-bold rounded-xl"
            >
              + {{ language === 'es' ? 'Crear Noticia' : 'Create Post' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/90 z-50 overflow-y-auto"
      >
        <div class="min-h-screen px-4 py-8">
          <div class="max-w-2xl mx-auto bg-gray-900 rounded-2xl p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-bold text-white">
                {{ editingNews ? (language === 'es' ? 'Editar Noticia' : 'Edit Post') : (language === 'es' ? 'Nueva Noticia' : 'New Post') }}
              </h2>
              <button @click="showModal = false" class="p-2 hover:bg-gray-800 rounded-lg">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form @submit.prevent="saveNews" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  {{ language === 'es' ? 'Título' : 'Title' }} *
                </label>
                <input
                  v-model="form.title"
                  type="text"
                  required
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  {{ language === 'es' ? 'Contenido' : 'Content' }} *
                </label>
                <textarea
                  v-model="form.content"
                  required
                  rows="6"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
                ></textarea>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    {{ language === 'es' ? 'Categoría' : 'Category' }}
                  </label>
                  <select
                    v-model="form.category"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                  >
                    <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                      {{ cat.label[language] }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    {{ language === 'es' ? 'Fecha de Publicación' : 'Publish Date' }}
                  </label>
                  <input
                    v-model="form.publish_date"
                    type="datetime-local"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  {{ language === 'es' ? 'URL de Imagen' : 'Image URL' }}
                </label>
                <input
                  v-model="form.image_url"
                  type="url"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  placeholder="https://..."
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    Instagram URL
                  </label>
                  <input
                    v-model="form.instagram_url"
                    type="url"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                    placeholder="https://instagram.com/..."
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    Facebook URL
                  </label>
                  <input
                    v-model="form.facebook_url"
                    type="url"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                    placeholder="https://facebook.com/..."
                  />
                </div>
              </div>

              <div class="flex items-center gap-6">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="form.is_published"
                    type="checkbox"
                    class="w-5 h-5 rounded bg-gray-800 border-gray-700 text-gold-400 focus:ring-gold-400"
                  />
                  <span class="text-white">{{ language === 'es' ? 'Publicar' : 'Publish' }}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="form.is_featured"
                    type="checkbox"
                    class="w-5 h-5 rounded bg-gray-800 border-gray-700 text-gold-400 focus:ring-gold-400"
                  />
                  <span class="text-white">{{ language === 'es' ? 'Destacar' : 'Feature' }}</span>
                </label>
              </div>

              <div class="flex gap-3 pt-4">
                <button
                  type="button"
                  @click="showModal = false"
                  class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700"
                >
                  {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                </button>
                <button
                  type="submit"
                  :disabled="saving"
                  class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
                >
                  {{ saving ? '...' : (language === 'es' ? 'Guardar' : 'Save') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
