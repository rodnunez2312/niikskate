<script setup lang="ts">
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const profileRole = ref<string | null>(null)
const profileFullName = ref<string | null>(null)

watch(
  () => user.value?.id,
  async id => {
    if (!id) {
      profileRole.value = null
      profileFullName.value = null
      return
    }
    const { data } = await client.from('profiles').select('role, full_name').eq('id', id).single()
    profileRole.value = data?.role ?? null
    profileFullName.value = data?.full_name?.trim() || null
  },
  { immediate: true }
)

const userFirstName = computed(() => {
  const full =
    profileFullName.value ||
    (typeof user.value?.user_metadata?.full_name === 'string' ? user.value.user_metadata.full_name : '') ||
    ''
  const trimmed = full.trim()
  if (trimmed) return trimmed.split(/\s+/)[0] || trimmed
  const email = user.value?.email || ''
  return email.split('@')[0] || ''
})

const isSkaterHome = computed(() => user.value && profileRole.value === 'customer')
</script>

<template>
  <div class="page-container min-h-screen relative">
    <div class="fixed inset-0 z-0 pointer-events-none flex items-center justify-center bg-black">
      <img src="/Niik_StainedGlass.png" alt="" class="h-screen w-auto object-contain" />
    </div>

    <header class="relative overflow-hidden px-4 pt-safe pb-4 z-10">
      <div class="max-w-lg mx-auto relative z-10">
        <div class="flex items-center justify-between mb-4 pt-4 gap-2">
          <LanguageCurrencyToggle />
          <div class="flex items-center gap-2 min-w-0 shrink">
            <span
              v-if="user && userFirstName"
              class="text-gold-400 text-sm font-semibold truncate max-w-[min(52vw,13rem)] text-right leading-tight"
            >
              {{ language === 'es' ? `¡Hola, ${userFirstName}!` : `Hello, ${userFirstName}!` }}
            </span>
            <NuxtLink
              :to="user ? '/profile' : '/auth/login'"
              class="w-10 h-10 shrink-0 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-gold-400/30"
            >
              <svg class="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </NuxtLink>
          </div>
        </div>

        <div class="text-center mb-2 bg-black/70 backdrop-blur-sm rounded-2xl py-4 px-4 border border-gold-400/30">
          <h1 class="text-2xl font-black tracking-tight text-white mb-1">
            <span class="text-gold-400">Niik</span><span class="text-white">Skate</span>
          </h1>
          <p class="text-gray-300 text-sm">
            {{ language === 'es' ? 'Academia de Skateboarding' : 'Skateboard Academy' }}
          </p>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto pb-24 relative z-10 space-y-8">
      <!-- 1. Créditos -->
      <HomeSkaterCreditsBalance v-if="isSkaterHome" />

      <!-- 2. Comprar créditos / Reservar clase -->
      <section>
        <h2 class="text-lg font-bold text-white mb-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1 inline-block">
          {{
            language === 'es' ? 'Comprar créditos / Reservar clase' : 'Buy credits / Book a class'
          }}
        </h2>

        <NuxtLink
          to="/book"
          class="block bg-gradient-to-r from-gold-400 to-gold-500 text-black rounded-2xl p-5 shadow-2xl shadow-gold-400/20 mb-3 border border-gold-300/50"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center text-2xl">🛹</div>
            <div class="flex-1">
              <p class="text-lg font-bold">
                {{ language === 'es' ? 'Reservar clase' : 'Book a class' }}
              </p>
              <p class="text-black/70 text-sm">
                {{
                  isSkaterHome
                    ? language === 'es'
                      ? 'Compra créditos, paquetes o una clase suelta'
                      : 'Buy credits, packages, or a single class'
                    : language === 'es'
                      ? 'Paquetes populares al elegir «Comprar créditos»'
                      : 'Popular packages under Buy credits'
                }}
              </p>
            </div>
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </NuxtLink>

        <NuxtLink
          v-if="isSkaterHome"
          to="/user/reservations"
          class="flex items-center justify-center gap-2 w-full mt-3 py-3 rounded-xl bg-glass-blue/20 border border-glass-blue/40 text-glass-blue font-semibold text-sm hover:bg-glass-blue/30 transition-colors"
        >
          🎫
          {{ language === 'es' ? 'Reservar con mis créditos' : 'Reserve with my credits' }}
        </NuxtLink>
      </section>

      <!-- 3. Calendario -->
      <HomeSkaterClassMonthCalendar v-if="isSkaterHome" />
      <HomeGuestClassAvailabilityCalendar v-else />

      <!-- 4. Rampas -->
      <section>
        <NuxtLink
          to="/shop?category=ramps"
          class="block bg-black/70 backdrop-blur-sm rounded-2xl p-5 border border-flame-600/50"
        >
          <div class="flex items-center gap-4">
            <span class="text-4xl">🏗️</span>
            <div class="flex-1">
              <p class="font-bold text-white text-lg">
                {{ language === 'es' ? 'Construcción de rampas' : 'Ramp construction' }}
              </p>
              <p class="text-sm text-gray-300">
                {{ language === 'es' ? '¡Cotiza gratis!' : 'Get a free quote!' }}
              </p>
            </div>
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </NuxtLink>
      </section>

      <!-- 6. Noticias -->
      <HomeNewsSection variant="section" />
    </div>
  </div>
</template>
