export type MemberNavItem = {
  name: string
  path: string
  icon: string
}

export type MemberNavSection = {
  id: string
  title: string
  items: MemberNavItem[]
}

type StaffNavItemDef = MemberNavItem & {
  /** Only admins see this item. Coaches never see it in the sidebar. */
  adminOnly?: boolean
}

type StaffNavSectionDef = {
  id: string
  titleEs: string
  titleEn: string
  items: StaffNavItemDef[]
}

export const STAFF_DASHBOARD_PATH = '/member/staff/dashboard'

export function useMemberNav() {
  const route = useRoute()
  const user = useSupabaseUser()
  const { language } = useI18n()
  const { isAdmin, isCoach, isStudent, isStaff } = useSiteProfile()

  const es = computed(() => language.value === 'es')

  const studentNav = computed((): MemberNavItem[] => [
    {
      name: es.value ? 'Clases' : 'Classes',
      path: '/member/student/classes',
      icon: 'calendar',
    },
    {
      name: es.value ? 'Familia' : 'Family',
      path: '/member/student/profile',
      icon: 'user',
    },
    {
      name: es.value ? 'Progreso' : 'Progress',
      path: '/member/student/progress',
      icon: 'chart',
    },
    {
      name: es.value ? 'Programa' : 'Program',
      path: '/member/student/training-program',
      icon: 'skate-program',
    },
    {
      name: es.value ? 'Competir' : 'Compete',
      path: '/member/student/competition',
      icon: 'flag',
    },
  ])

  /** Flat tabs kept for students (and any layout still using navItems). */
  const coachNav = computed((): MemberNavItem[] => [
    {
      name: es.value ? 'Planes' : 'Plans',
      path: '/member/coach/plans',
      icon: 'coaching',
    },
    {
      name: es.value ? 'Trucos' : 'Library',
      path: '/member/coach/library',
      icon: 'skills',
    },
    {
      name: es.value ? 'Alumnos' : 'Students',
      path: '/member/coach/students',
      icon: 'skills',
    },
    {
      name: es.value ? 'Evaluar' : 'Evaluations',
      path: '/member/coach/evaluations',
      icon: 'clipboard',
    },
    {
      name: es.value ? 'Perfil' : 'Profile',
      path: '/member/coach/profile',
      icon: 'user',
    },
  ])

  const adminNav = computed((): MemberNavItem[] => [
    {
      name: es.value ? 'Horarios' : 'Scheduling',
      path: '/member/admin/scheduling',
      icon: 'calendar',
    },
    {
      name: es.value ? 'Pagos' : 'Payments',
      path: '/member/admin/payments',
      icon: 'store',
    },
    {
      name: es.value ? 'Reportes' : 'Reports',
      path: '/member/admin/reports',
      icon: 'clipboard',
    },
    {
      name: es.value ? 'Competir' : 'Competitions',
      path: '/member/admin/competitions',
      icon: 'flag',
    },
    {
      name: es.value ? 'Academia' : 'Academy',
      path: '/member/admin/academy',
      icon: 'star',
    },
  ])

  const staffDashboardItem = computed((): MemberNavItem => ({
    name: 'Dashboard',
    path: STAFF_DASHBOARD_PATH,
    icon: 'grid',
  }))

  const staffSidebarDefs = computed((): StaffNavSectionDef[] => {
    const skatersPath = isAdmin.value
      ? '/member/admin/academy/users'
      : '/member/coach/students'
    const coachesPath = isAdmin.value
      ? '/member/admin/scheduling/coaches'
      : '/coach/availability'

    return [
      {
        id: 'scheduling',
        titleEs: 'Scheduling',
        titleEn: 'Scheduling',
        items: [
          {
            name: es.value ? 'Calendario escolar' : 'School calendar',
            path: '/member/admin/scheduling/calendar',
            icon: 'calendar',
            adminOnly: true,
          },
          {
            name: es.value ? 'Coaches' : 'Coaches',
            path: coachesPath,
            icon: 'users',
          },
          {
            name: es.value ? 'Asistencia' : 'Attendance',
            path: '/member/admin/scheduling/attendance',
            icon: 'clipboard',
            adminOnly: true,
          },
        ],
      },
      {
        id: 'skate-program',
        titleEs: 'Skate Program',
        titleEn: 'Skate Program',
        items: [
          {
            name: es.value ? 'Programas' : 'Programs',
            path: '/member/coach/library',
            icon: 'skate-program',
          },
          {
            name: es.value ? 'Trucos' : 'Tricks',
            path: '/member/coach/tricks',
            icon: 'skills',
          },
          {
            name: es.value ? 'Competencias' : 'Competitions',
            path: '/member/admin/competitions',
            icon: 'flag',
          },
          {
            name: es.value ? 'Planeación de clases' : 'Class planning',
            path: '/member/coach/plans',
            icon: 'coaching',
          },
          {
            name: es.value ? 'Certificaciones' : 'Certifications',
            path: '/member/coach/certifications',
            icon: 'star',
          },
        ],
      },
      {
        id: 'academy',
        titleEs: 'Academy',
        titleEn: 'Academy',
        items: [
          {
            name: es.value ? 'Panel academia' : 'Academy dashboard',
            path: '/member/admin/academy/dashboard',
            icon: 'star',
            adminOnly: true,
          },
          {
            name: es.value ? 'Patinadores' : 'Skaters',
            path: skatersPath,
            icon: 'users',
          },
          {
            name: es.value ? 'Reportes' : 'Reports',
            path: '/member/admin/reports',
            icon: 'chart',
            adminOnly: true,
          },
          {
            name: es.value ? 'Pagos' : 'Payments',
            path: '/member/admin/payments',
            icon: 'store',
            adminOnly: true,
          },
          {
            name: es.value ? 'Evaluación' : 'Evaluation',
            path: '/member/coach/evaluations',
            icon: 'clipboard',
          },
          {
            name: es.value ? 'Noticias' : 'News',
            path: '/member/admin/academy/news',
            icon: 'news',
            adminOnly: true,
          },
        ],
      },
      {
        id: 'admin',
        titleEs: 'Admin',
        titleEn: 'Admin',
        items: [
          {
            name: es.value ? 'Perfil' : 'Profile',
            path: '/member/coach/profile',
            icon: 'user',
          },
          {
            name: es.value ? 'Aprobaciones' : 'Approvals',
            path: '/member/admin/academy/registrations',
            icon: 'check',
            adminOnly: true,
          },
          {
            name: 'Skateshop',
            path: '/member/admin/skate-products',
            icon: 'store',
            adminOnly: true,
          },
        ],
      },
    ]
  })

  const staffNavSections = computed((): MemberNavSection[] => {
    if (!user.value || !isStaff.value) return []
    return staffSidebarDefs.value
      .map(section => ({
        id: section.id,
        title: es.value ? section.titleEs : section.titleEn,
        items: section.items
          .filter(item => !item.adminOnly || isAdmin.value)
          .map(({ name, path, icon }) => ({ name, path, icon })),
      }))
      .filter(section => section.items.length > 0)
  })

  const usesStaffSidebar = computed(() => Boolean(user.value && isStaff.value))

  const navItems = computed(() => {
    if (!user.value) return []
    // Staff use the grouped sidebar; keep flat tabs for students only.
    if (isStaff.value) return []
    if (isStudent.value) return studentNav.value
    return studentNav.value
  })

  const isActive = (path: string) => {
    if (path === STAFF_DASHBOARD_PATH) {
      return route.path === STAFF_DASHBOARD_PATH
    }
    if (path === '/member/student/classes' && (route.path === '/classes' || route.path.startsWith('/member/student/classes'))) return true
    if (path === '/member/student/profile' && route.path.startsWith('/member/student/profile')) return true
    if (path === '/member/student/progress' && route.path.startsWith('/member/student/progress')) return true
    // Class planning hub — tips/sessions/tricks tabs live here
    if (path === '/member/coach/plans') {
      return route.path === '/member/coach/plans' || route.path === '/member/coach/plans/'
    }
    if (path === '/member/coach/students' && route.path.startsWith('/member/coach/students')) return true
    if (path === '/member/coach/evaluations' && route.path.startsWith('/member/coach/evaluations')) return true
    if (path === '/member/admin/payments' && route.path.startsWith('/member/admin/payments')) return true
    // Programs = skill_groups library
    if (path === '/member/coach/library' && route.path.startsWith('/member/coach/library')) return true
    if (path === '/member/coach/tricks' && route.path.startsWith('/member/coach/tricks')) return true
    if (path === '/member/admin/competitions' && route.path.startsWith('/member/admin/competitions')) return true
    if (path === '/member/admin/reports' && route.path.startsWith('/member/admin/reports')) return true
    if (path === '/member/coach/profile' && route.path.startsWith('/member/coach/profile')) return true
    if (path === '/member/coach/certifications' && route.path.startsWith('/member/coach/certifications')) return true
    if (path === '/coach/availability' && route.path.startsWith('/coach/availability')) return true
    if (path === '/member/admin/academy/dashboard' && route.path.startsWith('/member/admin/academy/dashboard')) return true
    if (path === '/member/admin/academy/users' && route.path.startsWith('/member/admin/academy/users')) return true
    if (path === '/member/admin/skate-products' && (route.path.startsWith('/member/admin/skate-products') || route.path.startsWith('/dashboard/store'))) return true
    if (path === '/dashboard/store' && route.path.startsWith('/dashboard/store')) return true
    return route.path === path || route.path.startsWith(`${path}/`)
  }

  return {
    studentNav,
    coachNav,
    adminNav,
    staffDashboardItem,
    staffNavSections,
    usesStaffSidebar,
    navItems,
    isActive,
  }
}
