export type PublicNavItem = {
  label: { en: string; es: string }
  path: string
}

export const PUBLIC_NAV: PublicNavItem[] = [
  { label: { en: 'Home', es: 'Inicio' }, path: '/' },
  { label: { en: 'The Niik Method', es: 'El Método Niik' }, path: '/niik-method' },
  { label: { en: 'Skate Programs', es: 'Programas de Skate' }, path: '/skate-programs' },
  { label: { en: 'Skateshop', es: 'Skateshop' }, path: '/skateshop' },
  { label: { en: 'Community', es: 'Comunidad' }, path: '/community' },
]

export function usePublicNav() {
  const route = useRoute()
  const { language } = useI18n()

  const items = computed(() =>
    PUBLIC_NAV.map(item => ({
      ...item,
      name: language.value === 'es' ? item.label.es : item.label.en,
    })),
  )

  const isActive = (path: string) => {
    if (path === '/') return route.path === '/'
    return route.path === path || route.path.startsWith(`${path}/`)
  }

  return { items, isActive }
}
