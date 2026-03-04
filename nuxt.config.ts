// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/supabase',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/image',
  ],

  // App configuration
  app: {
    head: {
      title: 'NiikSkate Academy',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: 'Learn to skate with expert coaches at NiikSkate Academy. Book classes and shop for gear!' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#000000' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.json' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  // Supabase configuration
  supabase: {
    redirect: false,
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/', '/classes', '/equipment', '/equipment/*'],
    },
  },

  // Runtime config for environment variables
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
    },
  },

  // SSR configuration - disable for Capacitor mobile builds
  ssr: true,

  // Nitro configuration for static generation (mobile)
  nitro: {
    prerender: {
      crawlLinks: true,
    },
  },

  // TypeScript configuration
  typescript: {
    strict: true,
    shim: false,
  },

  // CSS
  css: ['~/assets/css/main.css'],

  // Tailwind CSS configuration
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: 'tailwind.config.js',
  },

  compatibilityDate: '2024-04-03',
})
