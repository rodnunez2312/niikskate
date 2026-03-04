export type Language = 'en' | 'es'
export type Currency = 'USD' | 'MXN'

// Exchange rate (approximate)
const USD_TO_MXN = 17.5

// Translations
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.schedule': 'Schedule',
    'nav.shop': 'Shop',
    'nav.bookings': 'Bookings',
    'nav.profile': 'Profile',
    
    // Home
    'home.welcome': 'Welcome back,',
    'home.guest': 'Skater',
    'home.tagline': 'Learn to skate with our expert coaches. From beginners to advanced riders.',
    'home.bookClass': 'Book a Class',
    'home.viewSchedule': 'View schedule',
    'home.shopGear': 'Shop Gear',
    'home.browseStore': 'Browse store',
    'home.ourClasses': 'Our Classes',
    'home.classSchedule': 'Class Schedule',
    'home.scheduleDays': 'Days: Tuesday, Thursday, Saturday',
    'home.session1': 'Session 1: 5:30 PM - 7:00 PM',
    'home.session2': 'Session 2: 7:00 PM - 8:30 PM',
    'home.viewMonthSchedule': 'View Schedule',
    'home.ourCoaches': 'Our Coaches',
    'home.featuredGear': 'Shop Gear',
    'home.seeAll': 'See all',
    'home.customRamps': 'Custom Ramp Building',
    'home.rampsDesc': 'We build mini ramps, quarter pipes, rails, and more!',
    'home.getQuote': 'Get a Quote',
    'home.perClass': 'per class',
    'home.perMonth': 'per month',
    'home.students': 'students',
    'home.student': 'student',
    'home.max': 'Max',
    'home.min': 'min',
    
    // Classes
    'class.groupedBeginner': 'Grouped Class - Beginners',
    'class.groupedBeginnerDesc': 'Perfect for newcomers to skateboarding. Learn the basics: balance, pushing, stopping, and your first tricks in a supportive group environment.',
    'class.groupedIntermediate': 'Grouped Class - Intermediate',
    'class.groupedIntermediateDesc': 'Take your skills to the next level. Focus on ollies, kickflips, ramp basics, and improving your overall technique.',
    'class.individual': 'Individual Class',
    'class.individualDesc': 'One-on-one coaching tailored to your specific goals. Perfect for rapid improvement or working on advanced techniques.',
    'class.monthlyBeginner': 'Monthly Program - Beginners',
    'class.monthlyBeginnerDesc': '8 group classes per month. Perfect for consistent progress and building a solid foundation.',
    'class.monthlyIntermediate': 'Monthly Program - Intermediate',
    'class.monthlyIntermediateDesc': '8 group classes per month for intermediate skaters. Level up your skills with regular practice.',
    
    // Schedule
    'schedule.title': 'Class Schedule',
    'schedule.today': 'Today',
    'schedule.selectDay': 'Select a highlighted day to view available classes and coaches',
    'schedule.classDays': 'Classes are held on Tuesday, Thursday, and Saturday',
    'schedule.selectTimeSlot': 'Select a time slot:',
    'schedule.availableCoaches': 'Available Coaches:',
    'schedule.noCoaches': 'No coaches available for this slot yet.',
    'schedule.availableClasses': 'Available Classes:',
    'schedule.available': 'Available',
    'schedule.full': 'Full',
    'schedule.booked': 'booked',
    'schedule.with': 'with',
    
    // Shop
    'shop.title': 'Shop',
    'shop.search': 'Search products...',
    'shop.all': 'All',
    'shop.noProducts': 'No products found',
    'shop.adjustFilters': 'Try adjusting your filters or search term',
    'shop.clearFilters': 'Clear Filters',
    'shop.sale': 'Sale',
    'shop.quote': 'Quote',
    'shop.outOfStock': 'Out of Stock',
    'shop.from': 'From',
    'shop.addToCart': 'Add to Cart',
    'shop.added': 'Added!',
    'shop.buyNow': 'Buy Now',
    'shop.requestQuote': 'Request a Quote',
    'shop.inStock': 'In Stock',
    'shop.onlyLeft': 'Only {count} left',
    'shop.description': 'Description',
    'shop.specifications': 'Specifications',
    'shop.quantity': 'Quantity',
    'shop.customBuild': 'Custom Build Service',
    'shop.customBuildDesc': 'This is a custom build service. Price varies based on your specific requirements, dimensions, and location. Request a free quote to get started!',
    
    // Categories
    'category.safety_equipment': 'Safety Equipment',
    'category.merchandise': 'Merchandise',
    'category.skateboards': 'Skateboards',
    'category.hardware': 'Hardware',
    'category.ramps': 'Ramps',
    
    // Cart
    'cart.title': 'Cart',
    'cart.empty': 'Your cart is empty',
    'cart.addItems': 'Add some gear to get started',
    'cart.shopNow': 'Shop Now',
    'cart.remove': 'Remove',
    'cart.orderSummary': 'Order Summary',
    'cart.subtotal': 'Subtotal',
    'cart.tax': 'Tax',
    'cart.shipping': 'Shipping',
    'cart.free': 'Free',
    'cart.total': 'Total',
    'cart.clearCart': 'Clear Cart',
    'cart.checkout': 'Checkout',
    'cart.items': 'items',
    'cart.item': 'item',
    
    // Bookings
    'bookings.title': 'My Bookings',
    'bookings.upcoming': 'Upcoming',
    'bookings.past': 'Past',
    'bookings.noUpcoming': 'No upcoming classes',
    'bookings.bookToStart': 'Book a class to start shredding!',
    'bookings.bookClass': 'Book a Class',
    'bookings.noPast': 'No past bookings',
    'bookings.historyHere': 'Your booking history will appear here',
    'bookings.viewSchedule': 'View Schedule',
    'bookings.cancel': 'Cancel',
    'bookings.bookAgain': 'Book Again',
    'bookings.cancelBooking': 'Cancel Booking',
    'bookings.cancelConfirm': 'Are you sure you want to cancel this class? This action cannot be undone.',
    'bookings.reason': 'Reason (optional)',
    'bookings.reasonPlaceholder': 'Tell us why you\'re cancelling...',
    'bookings.keepBooking': 'Keep Booking',
    'bookings.cancelling': 'Cancelling...',
    'bookings.coach': 'Coach',
    
    // Profile
    'profile.title': 'Profile',
    'profile.myAvailability': 'My Availability',
    'profile.myOrders': 'My Orders',
    'profile.inventoryManagement': 'Inventory Management',
    'profile.salesOrders': 'Sales & Orders',
    'profile.rampQuotes': 'Ramp Quotes',
    'profile.helpSupport': 'Help & Support',
    'profile.comingSoon': 'Coming soon',
    'profile.signOut': 'Sign Out',
    'profile.administrator': 'Administrator',
    'profile.coach': 'Coach',
    'profile.skater': 'Skater',
    'profile.fullName': 'Full Name',
    'profile.phone': 'Phone',
    'profile.noPhone': 'No phone added',
    'profile.save': 'Save',
    'profile.saving': 'Saving...',
    
    // Auth
    'auth.welcomeBack': 'Welcome Back',
    'auth.signInTo': 'Sign in to Skateboard Academy',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot password?',
    'auth.signIn': 'Sign In',
    'auth.signingIn': 'Signing in...',
    'auth.orContinueWith': 'or continue with',
    'auth.noAccount': 'Don\'t have an account?',
    'auth.signUp': 'Sign up',
    'auth.createAccount': 'Create Account',
    'auth.joinAcademy': 'Join Skateboard Academy and start shredding!',
    'auth.confirmPassword': 'Confirm Password',
    'auth.creatingAccount': 'Creating account...',
    'auth.hasAccount': 'Already have an account?',
    'auth.checkEmail': 'Check your email',
    'auth.confirmationSent': 'We\'ve sent a confirmation link to',
    'auth.clickToActivate': 'Click the link to activate your account.',
    'auth.backToSignIn': 'Back to Sign In',
    
    // Time slots
    'time.session1': '5:30 PM - 7:00 PM',
    'time.session2': '7:00 PM - 8:30 PM',
    
    // Days
    'day.tuesday': 'Tuesday',
    'day.thursday': 'Thursday',
    'day.saturday': 'Saturday',
    
    // Status
    'status.pending': 'Pending',
    'status.confirmed': 'Confirmed',
    'status.cancelled': 'Cancelled',
    'status.completed': 'Completed',
    'status.noShow': 'No Show',
    
    // General
    'general.loading': 'Loading...',
    'general.error': 'Error',
    'general.success': 'Success',
    'general.cancel': 'Cancel',
    'general.save': 'Save',
    'general.edit': 'Edit',
    'general.delete': 'Delete',
    'general.close': 'Close',
    'general.back': 'Back',
    'general.next': 'Next',
    'general.submit': 'Submit',
  },
  
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.schedule': 'Horario',
    'nav.shop': 'Tienda',
    'nav.bookings': 'Reservas',
    'nav.profile': 'Perfil',
    
    // Home
    'home.welcome': 'Bienvenido,',
    'home.guest': 'Patinador',
    'home.tagline': 'Aprende a patinar con nuestros entrenadores expertos. Desde principiantes hasta avanzados.',
    'home.bookClass': 'Reservar Clase',
    'home.viewSchedule': 'Ver horario',
    'home.shopGear': 'Comprar',
    'home.browseStore': 'Ver tienda',
    'home.ourClasses': 'Nuestras Clases',
    'home.classSchedule': 'Horario de Clases',
    'home.scheduleDays': 'Días: Martes, Jueves, Sábado',
    'home.session1': 'Sesión 1: 5:30 PM - 7:00 PM',
    'home.session2': 'Sesión 2: 7:00 PM - 8:30 PM',
    'home.viewMonthSchedule': 'Ver Horario',
    'home.ourCoaches': 'Nuestros Coaches',
    'home.featuredGear': 'Productos',
    'home.seeAll': 'Ver todo',
    'home.customRamps': 'Construcción de Rampas',
    'home.rampsDesc': '¡Construimos mini rampas, quarter pipes, rieles y más!',
    'home.getQuote': 'Pedir Cotización',
    'home.perClass': 'por clase',
    'home.perMonth': 'por mes',
    'home.students': 'alumnos',
    'home.student': 'alumno',
    'home.max': 'Máx',
    'home.min': 'min',
    
    // Classes
    'class.groupedBeginner': 'Clase Grupal - Principiantes',
    'class.groupedBeginnerDesc': 'Perfecto para principiantes. Aprende lo básico: equilibrio, impulso, frenado y tus primeros trucos en un ambiente de apoyo.',
    'class.groupedIntermediate': 'Clase Grupal - Intermedios',
    'class.groupedIntermediateDesc': 'Lleva tus habilidades al siguiente nivel. Enfócate en ollies, kickflips, rampas básicas y mejora tu técnica.',
    'class.individual': 'Clase Individual',
    'class.individualDesc': 'Entrenamiento uno a uno adaptado a tus metas específicas. Perfecto para mejorar rápidamente o trabajar técnicas avanzadas.',
    'class.monthlyBeginner': 'Programa Mensual - Principiantes',
    'class.monthlyBeginnerDesc': '8 clases grupales al mes. Perfecto para progreso constante y construir una base sólida.',
    'class.monthlyIntermediate': 'Programa Mensual - Intermedios',
    'class.monthlyIntermediateDesc': '8 clases grupales al mes para patinadores intermedios. Mejora tus habilidades con práctica regular.',
    
    // Schedule
    'schedule.title': 'Horario de Clases',
    'schedule.today': 'Hoy',
    'schedule.selectDay': 'Selecciona un día resaltado para ver clases y coaches disponibles',
    'schedule.classDays': 'Las clases son los Martes, Jueves y Sábados',
    'schedule.selectTimeSlot': 'Selecciona un horario:',
    'schedule.availableCoaches': 'Coaches Disponibles:',
    'schedule.noCoaches': 'No hay coaches disponibles para este horario.',
    'schedule.availableClasses': 'Clases Disponibles:',
    'schedule.available': 'Disponible',
    'schedule.full': 'Lleno',
    'schedule.booked': 'reservados',
    'schedule.with': 'con',
    
    // Shop
    'shop.title': 'Tienda',
    'shop.search': 'Buscar productos...',
    'shop.all': 'Todo',
    'shop.noProducts': 'No se encontraron productos',
    'shop.adjustFilters': 'Intenta ajustar los filtros o el término de búsqueda',
    'shop.clearFilters': 'Limpiar Filtros',
    'shop.sale': 'Oferta',
    'shop.quote': 'Cotizar',
    'shop.outOfStock': 'Agotado',
    'shop.from': 'Desde',
    'shop.addToCart': 'Agregar al Carrito',
    'shop.added': '¡Agregado!',
    'shop.buyNow': 'Comprar Ahora',
    'shop.requestQuote': 'Solicitar Cotización',
    'shop.inStock': 'En Stock',
    'shop.onlyLeft': 'Solo quedan {count}',
    'shop.description': 'Descripción',
    'shop.specifications': 'Especificaciones',
    'shop.quantity': 'Cantidad',
    'shop.customBuild': 'Servicio de Construcción',
    'shop.customBuildDesc': 'Este es un servicio de construcción personalizada. El precio varía según tus requisitos, dimensiones y ubicación. ¡Solicita una cotización gratis!',
    
    // Categories
    'category.safety_equipment': 'Equipo de Seguridad',
    'category.merchandise': 'Mercancía',
    'category.skateboards': 'Patinetas',
    'category.hardware': 'Accesorios',
    'category.ramps': 'Rampas',
    
    // Cart
    'cart.title': 'Carrito',
    'cart.empty': 'Tu carrito está vacío',
    'cart.addItems': 'Agrega productos para comenzar',
    'cart.shopNow': 'Comprar Ahora',
    'cart.remove': 'Eliminar',
    'cart.orderSummary': 'Resumen del Pedido',
    'cart.subtotal': 'Subtotal',
    'cart.tax': 'Impuesto',
    'cart.shipping': 'Envío',
    'cart.free': 'Gratis',
    'cart.total': 'Total',
    'cart.clearCart': 'Vaciar Carrito',
    'cart.checkout': 'Pagar',
    'cart.items': 'artículos',
    'cart.item': 'artículo',
    
    // Bookings
    'bookings.title': 'Mis Reservas',
    'bookings.upcoming': 'Próximas',
    'bookings.past': 'Anteriores',
    'bookings.noUpcoming': 'No hay clases próximas',
    'bookings.bookToStart': '¡Reserva una clase para empezar a patinar!',
    'bookings.bookClass': 'Reservar Clase',
    'bookings.noPast': 'No hay reservas anteriores',
    'bookings.historyHere': 'Tu historial de reservas aparecerá aquí',
    'bookings.viewSchedule': 'Ver Horario',
    'bookings.cancel': 'Cancelar',
    'bookings.bookAgain': 'Reservar de Nuevo',
    'bookings.cancelBooking': 'Cancelar Reserva',
    'bookings.cancelConfirm': '¿Estás seguro de que quieres cancelar esta clase? Esta acción no se puede deshacer.',
    'bookings.reason': 'Razón (opcional)',
    'bookings.reasonPlaceholder': 'Cuéntanos por qué cancelas...',
    'bookings.keepBooking': 'Mantener Reserva',
    'bookings.cancelling': 'Cancelando...',
    'bookings.coach': 'Coach',
    
    // Profile
    'profile.title': 'Perfil',
    'profile.myAvailability': 'Mi Disponibilidad',
    'profile.myOrders': 'Mis Pedidos',
    'profile.inventoryManagement': 'Gestión de Inventario',
    'profile.salesOrders': 'Ventas y Pedidos',
    'profile.rampQuotes': 'Cotizaciones de Rampas',
    'profile.helpSupport': 'Ayuda y Soporte',
    'profile.comingSoon': 'Próximamente',
    'profile.signOut': 'Cerrar Sesión',
    'profile.administrator': 'Administrador',
    'profile.coach': 'Coach',
    'profile.skater': 'Patinador',
    'profile.fullName': 'Nombre Completo',
    'profile.phone': 'Teléfono',
    'profile.noPhone': 'Sin teléfono',
    'profile.save': 'Guardar',
    'profile.saving': 'Guardando...',
    
    // Auth
    'auth.welcomeBack': 'Bienvenido',
    'auth.signInTo': 'Inicia sesión en Skateboard Academy',
    'auth.email': 'Correo electrónico',
    'auth.password': 'Contraseña',
    'auth.forgotPassword': '¿Olvidaste tu contraseña?',
    'auth.signIn': 'Iniciar Sesión',
    'auth.signingIn': 'Iniciando sesión...',
    'auth.orContinueWith': 'o continuar con',
    'auth.noAccount': '¿No tienes cuenta?',
    'auth.signUp': 'Regístrate',
    'auth.createAccount': 'Crear Cuenta',
    'auth.joinAcademy': '¡Únete a Skateboard Academy y empieza a patinar!',
    'auth.confirmPassword': 'Confirmar Contraseña',
    'auth.creatingAccount': 'Creando cuenta...',
    'auth.hasAccount': '¿Ya tienes cuenta?',
    'auth.checkEmail': 'Revisa tu correo',
    'auth.confirmationSent': 'Hemos enviado un enlace de confirmación a',
    'auth.clickToActivate': 'Haz clic en el enlace para activar tu cuenta.',
    'auth.backToSignIn': 'Volver a Iniciar Sesión',
    
    // Time slots
    'time.session1': '5:30 PM - 7:00 PM',
    'time.session2': '7:00 PM - 8:30 PM',
    
    // Days
    'day.tuesday': 'Martes',
    'day.thursday': 'Jueves',
    'day.saturday': 'Sábado',
    
    // Status
    'status.pending': 'Pendiente',
    'status.confirmed': 'Confirmado',
    'status.cancelled': 'Cancelado',
    'status.completed': 'Completado',
    'status.noShow': 'No Asistió',
    
    // General
    'general.loading': 'Cargando...',
    'general.error': 'Error',
    'general.success': 'Éxito',
    'general.cancel': 'Cancelar',
    'general.save': 'Guardar',
    'general.edit': 'Editar',
    'general.delete': 'Eliminar',
    'general.close': 'Cerrar',
    'general.back': 'Atrás',
    'general.next': 'Siguiente',
    'general.submit': 'Enviar',
  },
}

export const useI18n = () => {
  // Get saved preferences from localStorage
  const language = useState<Language>('language', () => {
    if (import.meta.client) {
      return (localStorage.getItem('language') as Language) || 'es'
    }
    return 'es'
  })
  
  const currency = useState<Currency>('currency', () => {
    if (import.meta.client) {
      return (localStorage.getItem('currency') as Currency) || 'MXN'
    }
    return 'MXN'
  })

  // Save preferences when they change
  watch(language, (newLang) => {
    if (import.meta.client) {
      localStorage.setItem('language', newLang)
    }
  })

  watch(currency, (newCurrency) => {
    if (import.meta.client) {
      localStorage.setItem('currency', newCurrency)
    }
  })

  // Translation function
  const t = (key: string, params?: Record<string, string | number>): string => {
    let text = translations[language.value][key] || translations['en'][key] || key
    
    // Replace parameters like {count}
    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        text = text.replace(`{${param}}`, String(value))
      })
    }
    
    return text
  }

  // Format price based on currency
  const formatPrice = (priceInMXN: number): string => {
    if (currency.value === 'USD') {
      const usdPrice = priceInMXN / USD_TO_MXN
      // Round UP to nearest 5
      const rounded = Math.ceil(usdPrice / 5) * 5
      return `$${rounded} USD`
    }
    return `$${priceInMXN.toFixed(0)} MXN`
  }

  // Convert price if needed
  const convertPrice = (priceInMXN: number): number => {
    if (currency.value === 'USD') {
      return priceInMXN / USD_TO_MXN
    }
    return priceInMXN
  }

  // Toggle language AND currency together
  const toggleLanguage = () => {
    if (language.value === 'en') {
      language.value = 'es'
      currency.value = 'MXN'
    } else {
      language.value = 'en'
      currency.value = 'USD'
    }
  }

  // Toggle currency (also syncs language)
  const toggleCurrency = () => {
    toggleLanguage() // They're now linked
  }
  
  // Toggle both at once
  const toggleLocale = () => {
    toggleLanguage()
  }

  // Set language
  const setLanguage = (lang: Language) => {
    language.value = lang
  }

  // Set currency
  const setCurrency = (curr: Currency) => {
    currency.value = curr
  }

  return {
    language,
    currency,
    t,
    formatPrice,
    convertPrice,
    toggleLanguage,
    toggleCurrency,
    toggleLocale,
    setLanguage,
    setCurrency,
  }
}
