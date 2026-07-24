<template>
  <div class="min-h-screen bg-black text-white flex flex-col">
    <PublicSiteHeader />
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-gray-800 py-8 px-4">
      <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <p>© {{ new Date().getFullYear() }} NiikSkate Academy</p>
        <div class="flex gap-4">
          <NuxtLink to="/shop" class="hover:text-gold-400">Shop</NuxtLink>
          <NuxtLink to="/auth/login" class="hover:text-gold-400">Member login</NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>
