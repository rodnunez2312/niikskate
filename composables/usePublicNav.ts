export type PublicNavItem = {
  label: { en: string; es: string }
  path: string
}

export const PUBLIC_NAV: PublicNavItem[] = [
  { label: { en: 'Home', es: 'Inicio' }, path: '/' },
  { label: { en: 'Niik Method', es: 'Método Niik' }, path: '/niik-method' },
  { label: { en: 'Programs', es: 'Programas' }, path: '/skate-programs' },
  { label: { en: 'Partners', es: 'Alianzas' }, path: '/alianzas' },
  { label: { en: 'Shop', es: 'Tienda' }, path: '/skateshop' },
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
