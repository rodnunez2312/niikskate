/** On native Capacitor builds, land in the member platform instead of the public marketing home. */
export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  const win = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean }
  }
  if (!win.Capacitor?.isNativePlatform?.()) return

  const router = useRouter()
  const route = useRoute()

  const publicEntryPaths = ['/', '/index.html']
  if (publicEntryPaths.includes(route.path)) {
    void router.replace('/member')
  }
})
