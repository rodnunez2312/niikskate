/** Deep links and store URLs for the NiikSkate member mobile app. */
export function useMemberApp() {
  const config = useRuntimeConfig()
  const route = useRoute()

  const memberHomePath = computed(() => '/member')

  const iosStoreUrl = computed(
    () => (config.public.memberAppIosUrl as string) || '',
  )
  const androidStoreUrl = computed(
    () => (config.public.memberAppAndroidUrl as string) || '',
  )

  /** Custom URL scheme once the Capacitor app is published (e.g. niikskate://member). */
  const appDeepLink = computed(
    () => (config.public.memberAppDeepLink as string) || 'niikskate://member',
  )

  const isCapacitor = computed(() => {
    if (import.meta.server) return false
    return !!(window as Window & { Capacitor?: unknown }).Capacitor
  })

  const isMobileWeb = computed(() => {
    if (import.meta.server) return false
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  })

  function openMemberApp(fallbackPath = '/member') {
    if (import.meta.server) return

    const router = useRouter()
    const goWeb = () => {
      void router.push(fallbackPath)
    }

    if (isCapacitor.value) {
      goWeb()
      return
    }

    // On mobile web, try the native app deep link briefly, then fall back to web.
    if (isMobileWeb.value && appDeepLink.value) {
      let navigated = false
      const goWebOnce = () => {
        if (navigated) return
        navigated = true
        goWeb()
      }
      const timer = window.setTimeout(goWebOnce, 1200)
      const onHide = () => {
        if (document.hidden) {
          navigated = true
          clearTimeout(timer)
          document.removeEventListener('visibilitychange', onHide)
        }
      }
      document.addEventListener('visibilitychange', onHide)
      window.location.href = appDeepLink.value
      return
    }

    goWeb()
  }

  function memberAppRedirectPath() {
    return encodeURIComponent(route.fullPath)
  }

  return {
    memberHomePath,
    iosStoreUrl,
    androidStoreUrl,
    appDeepLink,
    isCapacitor,
    isMobileWeb,
    openMemberApp,
    memberAppRedirectPath,
  }
}
