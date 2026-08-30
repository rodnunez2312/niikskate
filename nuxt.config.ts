// https://nuxt.com/docs/api/configuration/nuxt-config

import { resolveAppBuildMeta } from './server/utils/appBuildMeta'

// OneDrive / cloud-sync folders: native FS watchers often fire bogus delete events on
// `.nuxt/dist`, which makes Nuxt restart in a loop and the browser stays blank/spinning.
const isWin = process.platform === 'win32'
const appBuildMeta = resolveAppBuildMeta()

export default defineNuxtConfig({
  // Devtools cost ~8s of module setup on every boot; opt in with NIIK_DEVTOOLS=1.
  devtools: { enabled: process.env.NIIK_DEVTOOLS === '1' },

  vite: {
    ...(isWin
      ? {
          server: {
            watch: {
              usePolling: true,
              interval: 1000,
              // Polling walks every path it is given, so keep heavy/irrelevant trees out.
              ignored: [
                '**/.nuxt/**',
                '**/node_modules/**',
                '**/.git/**',
                '**/.output/**',
                '**/data/Niik_source/**',
              ],
            },
          },
        }
      : {}),
  },

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
    pageTransition: { name: 'page' },
  },

  // Supabase configuration
  supabase: {
    redirect: false,
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/', '/classes', '/niik-method', '/skate-programs', '/community', '/shop', '/shop/*', '/skateshop', '/cart', '/equipment', '/equipment/*'],
    },
  },

  // Runtime config for environment variables
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
      memberAppIosUrl: process.env.NUXT_PUBLIC_MEMBER_APP_IOS_URL || '',
      memberAppAndroidUrl: process.env.NUXT_PUBLIC_MEMBER_APP_ANDROID_URL || '',
      memberAppDeepLink: process.env.NUXT_PUBLIC_MEMBER_APP_DEEP_LINK || 'niikskate://member',
    },
    // Server-only: for admin create user (use in server/api)
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    /** Optional: ramp design AI suggestions (admin skateramps). */
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    /**
     * Transactional email (Resend). Without a key the ramp request still saves
     * and shows in the admin inbox, it just does not reach the Gmail account.
     */
    resendApiKey: process.env.RESEND_API_KEY || '',
    mailFrom: process.env.MAIL_FROM || 'NiikSkate <hola@niikskate.com>',
    contactInboxEmail: process.env.CONTACT_INBOX_EMAIL || 'niikskateacademy@gmail.com',
    // Server-only: Twilio WhatsApp (https://www.twilio.com/docs/whatsapp)
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    /** Meta Graph: Instagram Business media (optional; see server/api/social/meta-feed.get.ts) */
    metaInstagramUserToken: process.env.META_INSTAGRAM_USER_TOKEN || '',
    metaInstagramBusinessId: process.env.META_INSTAGRAM_BUSINESS_ID || '',
    /** Meta Graph: Facebook Page feed with full_picture (optional) */
    metaFacebookPageToken: process.env.META_FACEBOOK_PAGE_TOKEN || '',
    metaFacebookPageId: process.env.META_FACEBOOK_PAGE_ID || '',
    /** Server-only deploy info (admin API); set at build on Vercel. */
    appBuildShaShort: appBuildMeta.shaShort,
    appBuildShaFull: appBuildMeta.shaFull,
    appBuildMessage: appBuildMeta.message,
    appBuildAt: appBuildMeta.builtAt,
    appBuildEnv: appBuildMeta.environment,
    appBuildBranch: appBuildMeta.branch,
  },

  // SSR configuration - disable for Capacitor mobile builds
  ssr: true,

  routeRules: {
    '/shop': { redirect: '/skateshop' },
    '/skate-products': { redirect: '/skateshop' },
  },

  // Nitro configuration
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/'],
      ignore: ['/auth/', '/dashboard/', '/coach/', '/admin/', '/student/'],
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
