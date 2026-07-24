export type MemberNavItem = {
  name: string
  path: string
  icon: string
}

export function useMemberNav() {
  const route = useRoute()
  const user = useSupabaseUser()
  const { language } = useI18n()
  const { isAdmin, isCoach, isStudent } = useSiteProfile()

  const studentNav = computed((): MemberNavItem[] => [
    {
      name: language.value === 'es' ? 'Clases' : 'Classes',
      path: '/member/student/classes',
      icon: 'calendar',
    },
    {
      name: language.value === 'es' ? 'Crew' : 'Crew',
      path: '/member/student/profile',
      icon: 'user',
    },
    {
      name: language.value === 'es' ? 'Progreso' : 'Progress',
      path: '/member/student/progress',
      icon: 'chart',
    },
    {
      name: language.value === 'es' ? 'Programa' : 'Program',
      path: '/member/student/training-program',
      icon: 'skate-program',
    },
    {
      name: language.value === 'es' ? 'Competir' : 'Compete',
      path: '/member/student/competition',
      icon: 'flag',
    },
  ])

  const coachNav = computed((): MemberNavItem[] => [
    {
      name: language.value === 'es' ? 'Planes' : 'Plans',
      path: '/member/coach/plans',
      icon: 'coaching',
    },
    {
      name: language.value === 'es' ? 'Trucos' : 'Library',
      path: '/member/coach/library',
      icon: 'skills',
    },
    {
      name: language.value === 'es' ? 'Alumnos' : 'Students',
      path: '/member/coach/students',
      icon: 'skills',
    },
    {
      name: language.value === 'es' ? 'Evaluar' : 'Evaluations',
      path: '/member/coach/evaluations',
      icon: 'clipboard',
    },
    {
      name: language.value === 'es' ? 'Perfil' : 'Profile',
      path: '/member/coach/profile',
      icon: 'user',
    },
  ])

  const adminNav = computed((): MemberNavItem[] => [
    {
      name: language.value === 'es' ? 'Horarios' : 'Scheduling',
      path: '/member/admin/scheduling',
      icon: 'calendar',
    },
    {
      name: language.value === 'es' ? 'Pagos' : 'Payments',
      path: '/member/admin/payments',
      icon: 'store',
    },
    {
      name: language.value === 'es' ? 'Reportes' : 'Reports',
      path: '/member/admin/reports',
      icon: 'clipboard',
    },
    {
      name: language.value === 'es' ? 'Competir' : 'Competitions',
      path: '/member/admin/competitions',
      icon: 'flag',
    },
    {
      name: language.value === 'es' ? 'Academia' : 'Academy',
      path: '/member/admin/academy',
      icon: 'star',
    },
  ])

  const navItems = computed(() => {
    if (!user.value) return []
    if (isAdmin.value) return adminNav.value
    if (isCoach.value) return coachNav.value
    if (isStudent.value) return studentNav.value
    return studentNav.value
  })

  const isActive = (path: string) => {
    if (path === '/member/student/classes' && (route.path === '/classes' || route.path.startsWith('/member/student/classes'))) return true
    if (path === '/member/student/profile' && route.path.startsWith('/member/student/profile')) return true
    if (path === '/member/student/progress' && route.path.startsWith('/member/student/progress')) return true
    if (path === '/member/coach/plans' && route.path.startsWith('/member/coach/plans')) return true
    if (path === '/member/coach/students' && route.path.startsWith('/member/coach/students')) return true
    if (path === '/member/coach/evaluations' && route.path.startsWith('/member/coach/evaluations')) return true
    if (path === '/member/admin/payments' && route.path.startsWith('/member/admin/payments')) return true
    if (path === '/member/coach/library' && route.path.startsWith('/member/coach/library')) return true
    if (path === '/member/admin/scheduling' && route.path.startsWith('/member/admin/scheduling')) return true
    if (path === '/member/admin/academy' && route.path.startsWith('/member/admin/academy')) return true
    return route.path === path || route.path.startsWith(`${path}/`)
  }

  return {
    studentNav,
    coachNav,
    adminNav,
    navItems,
    isActive,
  }
}
