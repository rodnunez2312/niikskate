<script setup lang="ts">
const { language } = useI18n()
const es = computed(() => language.value === 'es')
</script>

<template>
  <div class="public-site min-h-screen bg-charcoal text-cream flex flex-col">
    <a
      href="#contenido"
      class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-full focus:bg-acid focus:text-charcoal focus:font-bold"
    >
      {{ es ? 'Saltar al contenido' : 'Skip to content' }}
    </a>
    <PublicSiteHeader />
    <main id="contenido" tabindex="-1" class="flex-1 focus:outline-none">
      <slot />
    </main>
    <footer class="bg-charcoal border-t border-charcoal-700 py-12 px-4">
      <div class="max-w-6xl mx-auto flex flex-col gap-6 text-sm text-cream/70">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p class="font-display text-cream font-black text-xl mb-1">
              <span class="text-acid">Niik</span>Skate
            </p>
            <p>© {{ new Date().getFullYear() }} NiikSkate Academy</p>
          </div>
          <nav :aria-label="es ? 'Pie de página' : 'Footer'" class="flex flex-wrap gap-x-6 gap-y-3">
            <NuxtLink to="/niik-method" class="hover:text-acid transition-colors">{{ es ? 'Método Niik' : 'Niik Method' }}</NuxtLink>
            <NuxtLink to="/skate-programs" class="hover:text-acid transition-colors">{{ es ? 'Programas' : 'Programs' }}</NuxtLink>
            <NuxtLink to="/alianzas" class="hover:text-acid transition-colors">{{ es ? 'Alianzas' : 'Partners' }}</NuxtLink>
            <NuxtLink to="/skateshop" class="hover:text-acid transition-colors">{{ es ? 'Tienda' : 'Shop' }}</NuxtLink>
            <NuxtLink to="/auth/login" class="hover:text-acid transition-colors">{{ es ? 'Acceso miembros' : 'Member login' }}</NuxtLink>
          </nav>
        </div>
      </div>
    </footer>
  </div>
</template>
