<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { RegistrationRequest } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isAdmin = ref(false)
const loading = ref(true)
const requests = ref<RegistrationRequest[]>([])
const selectedTab = ref<'pending' | 'approved' | 'rejected'>('pending')

// Modal state
const showRejectModal = ref(false)
const rejectingRequest = ref<RegistrationRequest | null>(null)
const rejectionReason = ref('')
const processingId = ref<string | null>(null)

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/registrations')
    return
  }

  // Check user role
  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'admin') {
    router.push('/')
    return
  }

  isAdmin.value = true
  await loadRequests()
})

const loadRequests = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('registration_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    requests.value = data || []
  } catch (e) {
    console.error('Error loading requests:', e)
  } finally {
    loading.value = false
  }
}

// Filter requests by tab
const filteredRequests = computed(() => {
  return requests.value.filter(r => r.status === selectedTab.value)
})

// Counts
const counts = computed(() => ({
  pending: requests.value.filter(r => r.status === 'pending').length,
  approved: requests.value.filter(r => r.status === 'approved').length,
  rejected: requests.value.filter(r => r.status === 'rejected').length,
}))

// Approve request
const approveRequest = async (request: RegistrationRequest) => {
  processingId.value = request.id
  try {
    // Update request status
    const { error } = await client
      .from('registration_requests')
      .update({
        status: 'approved',
        reviewed_by: user.value?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    if (error) throw error

    // Create the actual user account via Supabase Auth invite
    // For now, we'll just mark it as approved - the user will need to set up their password via email
    // In production, you'd send an invite email here

    await loadRequests()
  } catch (e) {
    console.error('Error approving request:', e)
  } finally {
    processingId.value = null
  }
}

// Open reject modal
const openRejectModal = (request: RegistrationRequest) => {
  rejectingRequest.value = request
  rejectionReason.value = ''
  showRejectModal.value = true
}

// Reject request
const rejectRequest = async () => {
  if (!rejectingRequest.value) return
  
  processingId.value = rejectingRequest.value.id
  try {
    const { error } = await client
      .from('registration_requests')
      .update({
        status: 'rejected',
        reviewed_by: user.value?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason.value || null,
      })
      .eq('id', rejectingRequest.value.id)

    if (error) throw error

    showRejectModal.value = false
    rejectingRequest.value = null
    await loadRequests()
  } catch (e) {
    console.error('Error rejecting request:', e)
  } finally {
    processingId.value = null
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy, HH:mm', { locale })
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <button @click="router.push('/admin')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Aprobaciones de Registro' : 'Registration Approvals' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Gestionar solicitudes' : 'Manage requests' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ language === 'es' ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Tabs -->
      <div class="flex gap-2 mb-6">
        <button
          @click="selectedTab = 'pending'"
          class="flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          :class="selectedTab === 'pending' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
        >
          <span>⏳</span>
          {{ language === 'es' ? 'Pendientes' : 'Pending' }}
          <span v-if="counts.pending > 0" class="px-2 py-0.5 rounded-full text-xs font-bold"
            :class="selectedTab === 'pending' ? 'bg-black/20 text-black' : 'bg-gold-400 text-black'">
            {{ counts.pending }}
          </span>
        </button>
        <button
          @click="selectedTab = 'approved'"
          class="flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          :class="selectedTab === 'approved' ? 'bg-glass-green text-white' : 'bg-gray-800 text-gray-400'"
        >
          <span>✅</span>
          {{ language === 'es' ? 'Aprobados' : 'Approved' }}
        </button>
        <button
          @click="selectedTab = 'rejected'"
          class="flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          :class="selectedTab === 'rejected' ? 'bg-flame-600 text-white' : 'bg-gray-800 text-gray-400'"
        >
          <span>❌</span>
          {{ language === 'es' ? 'Rechazados' : 'Rejected' }}
        </button>
      </div>

      <!-- Request List -->
      <div class="space-y-3">
        <div v-if="filteredRequests.length === 0" class="text-center py-12">
          <p class="text-4xl mb-3">{{ selectedTab === 'pending' ? '📭' : selectedTab === 'approved' ? '✅' : '❌' }}</p>
          <p class="text-gray-400">
            {{ language === 'es' 
              ? `No hay solicitudes ${selectedTab === 'pending' ? 'pendientes' : selectedTab === 'approved' ? 'aprobadas' : 'rechazadas'}` 
              : `No ${selectedTab} requests` 
            }}
          </p>
        </div>

        <div
          v-for="request in filteredRequests"
          :key="request.id"
          class="bg-gray-900 border border-gray-800 rounded-2xl p-5"
        >
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-xl font-bold text-white">
                {{ request.full_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <h3 class="font-bold text-white">{{ request.full_name }}</h3>
                <p class="text-sm text-gray-400">{{ request.email }}</p>
              </div>
            </div>
            <span class="text-xs text-gray-500">{{ formatDate(request.created_at) }}</span>
          </div>

          <div v-if="request.phone" class="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <span>📱</span>
            <span>{{ request.phone }}</span>
          </div>

          <div v-if="request.message" class="bg-gray-800/50 rounded-lg p-3 mb-4">
            <p class="text-sm text-gray-300 italic">"{{ request.message }}"</p>
          </div>

          <!-- Actions for pending -->
          <div v-if="request.status === 'pending'" class="flex gap-2">
            <button
              @click="approveRequest(request)"
              :disabled="processingId === request.id"
              class="flex-1 py-3 bg-glass-green text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg v-if="processingId === request.id" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span v-else>✅</span>
              {{ language === 'es' ? 'Aprobar' : 'Approve' }}
            </button>
            <button
              @click="openRejectModal(request)"
              :disabled="processingId === request.id"
              class="flex-1 py-3 bg-gray-800 text-flame-500 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>❌</span>
              {{ language === 'es' ? 'Rechazar' : 'Reject' }}
            </button>
          </div>

          <!-- Info for approved/rejected -->
          <div v-else-if="request.reviewed_at" class="text-sm text-gray-500">
            {{ language === 'es' ? 'Revisado: ' : 'Reviewed: ' }}{{ formatDate(request.reviewed_at) }}
            <span v-if="request.rejection_reason" class="block text-flame-400 mt-1">
              {{ language === 'es' ? 'Razón: ' : 'Reason: ' }}{{ request.rejection_reason }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Reject Modal -->
    <Teleport to="body">
      <div v-if="showRejectModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80" @click="showRejectModal = false"></div>
        <div class="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
          <h3 class="text-xl font-bold text-white mb-2">
            {{ language === 'es' ? 'Rechazar Solicitud' : 'Reject Request' }}
          </h3>
          <p class="text-gray-400 mb-4">
            {{ language === 'es' 
              ? `¿Estás seguro de rechazar la solicitud de ${rejectingRequest?.full_name}?` 
              : `Are you sure you want to reject ${rejectingRequest?.full_name}'s request?` 
            }}
          </p>
          
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-300 mb-2">
              {{ language === 'es' ? 'Razón (opcional)' : 'Reason (optional)' }}
            </label>
            <textarea
              v-model="rejectionReason"
              rows="3"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-flame-500 focus:ring-1 focus:ring-flame-500 outline-none resize-none"
              :placeholder="language === 'es' ? 'Escribe la razón del rechazo...' : 'Enter rejection reason...'"
            ></textarea>
          </div>

          <div class="flex gap-3">
            <button
              @click="showRejectModal = false"
              class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              @click="rejectRequest"
              :disabled="processingId !== null"
              class="flex-1 py-3 bg-flame-600 text-white font-bold rounded-xl disabled:opacity-50"
            >
              {{ language === 'es' ? 'Rechazar' : 'Reject' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
