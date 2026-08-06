<template>
  <div class="min-h-screen bg-black text-white flex flex-col">
    <PublicSiteHeader />
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-gray-800 py-10 px-4">
      <div class="max-w-6xl mx-auto flex flex-col gap-6 text-sm text-gray-500">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p class="text-white font-black text-lg mb-1">
              <span class="text-gold-400">Niik</span>Skate
            </p>
            <p>© {{ new Date().getFullYear() }} NiikSkate Academy</p>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-2">
            <NuxtLink to="/skate-programs" class="hover:text-gold-400">Programs</NuxtLink>
            <NuxtLink to="/skateshop" class="hover:text-gold-400">Skateshop</NuxtLink>
            <NuxtLink to="/community" class="hover:text-gold-400">Community</NuxtLink>
            <NuxtLink to="/auth/login" class="hover:text-gold-400">Member login</NuxtLink>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
