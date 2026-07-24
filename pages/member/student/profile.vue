<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const { language } = useI18n()
const {
  participants,
  activeKey,
  activeParticipant,
  crewCount,
  loading,
  guardianProfile,
  crewMembers,
  addCrewMember,
  updateCrewMember,
  deleteCrewMember,
  updateGuardianProfile,
  setActive,
  refreshCrew,
} = useCrew()

const route = useRoute()

const showForm = ref(false)
const editingKey = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')

const form = ref({
  first_name: '',
  last_name: '',
  date_of_birth: '',
})

const isEditingSelf = computed(() => editingKey.value === 'self')

function openAdd() {
  editingKey.value = null
  form.value = { first_name: '', last_name: '', date_of_birth: '' }
  formError.value = ''
  showForm.value = true
}

function openEdit(key: string) {
  const p = participants.value.find(x => x.key === key)
  if (!p) return
  editingKey.value = key
  if (key === 'self' && guardianProfile.value) {
    form.value = {
      first_name: guardianProfile.value.first_name || '',
      last_name: guardianProfile.value.last_name || '',
      date_of_birth: guardianProfile.value.date_of_birth || '',
    }
  } else {
    const row = crewMembers.value.find(m => m.id === key)
    form.value = {
      first_name: p.firstName,
      last_name: row?.last_name || '',
      date_of_birth: p.dateOfBirth || '',
    }
  }
  formError.value = ''
  showForm.value = true
}

async function saveForm() {
  formError.value = ''
  saving.value = true
  try {
    const payload = {
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      date_of_birth: form.value.date_of_birth || null,
    }
    if (isEditingSelf.value) {
      await updateGuardianProfile(payload)
    } else if (editingKey.value) {
      await updateCrewMember(editingKey.value, payload)
    } else {
      await addCrewMember(payload)
    }
    showForm.value = false
  } catch (e: any) {
    formError.value = e?.message || 'Error'
  } finally {
    saving.value = false
  }
}

async function removeMember(id: string) {
  const ok = confirm(
    language.value === 'es'
      ? '¿Eliminar este miembro del crew?'
      : 'Remove this crew member?',
  )
  if (!ok) return
  try {
    await deleteCrewMember(id)
  } catch (e: any) {
    formError.value = e?.message || 'Error'
  }
}

const skillLabel = (level: string | null | undefined) => {
  if (!level) {
    return language.value === 'es' ? 'Nivel: sin evaluar' : 'Skill level: not yet assessed'
  }
  return language.value === 'es' ? `Nivel: ${level}` : `Skill level: ${level}`
}

onMounted(async () => {
  await refreshCrew()
  if (route.query.add === '1') openAdd()
})
</script>

<template>
  <div class="min-h-screen bg-[#fff9f0] text-gray-900 pb-24">
    <div class="max-w-lg mx-auto px-4 py-8">
      <div class="flex items-center justify-between gap-3 mb-6">
        <h1 class="text-2xl font-black uppercase tracking-tight">
          {{ language === 'es' ? 'Tu crew' : 'Your crew' }}
        </h1>
        <button
          type="button"
          class="rounded-full border-2 border-black px-4 py-1.5 text-sm font-bold hover:bg-black hover:text-white transition-colors"
          @click="openAdd"
        >
          + {{ language === 'es' ? 'Agregar' : 'Add' }}
        </button>
      </div>

      <div class="text-center mb-8">
        <div
          class="inline-flex items-center justify-center w-16 h-16 rounded-full border-4 border-teal-600 text-2xl font-black mb-3"
        >
          {{ crewCount }}
        </div>
        <p class="text-sm font-black uppercase tracking-wide text-gray-700">
          {{
            language === 'es'
              ? 'Miembros en tu crew'
              : 'Members in your crew'
          }}
        </p>
      </div>

      <div v-if="loading" class="h-40 bg-white border-2 border-black rounded-xl animate-pulse" />

      <div v-else class="space-y-4">
        <article
          v-for="p in participants"
          :key="p.key"
          class="border-[3px] border-teal-600 rounded-2xl bg-white overflow-hidden"
          :class="activeKey === p.key ? 'ring-2 ring-teal-500 ring-offset-2' : ''"
        >
          <div class="p-4 border-b-2 border-teal-600/30 flex items-start gap-3">
            <div
              class="w-14 h-14 rounded-full bg-gray-200 border-2 border-black flex items-center justify-center overflow-hidden shrink-0"
            >
              <img
                v-if="p.avatarUrl"
                :src="p.avatarUrl"
                :alt="p.displayName"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-2xl">🛹</span>
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="text-lg font-black uppercase leading-tight truncate">
                {{ p.displayName }}
              </h2>
              <p class="text-xs font-bold uppercase text-gray-600 mt-1">
                {{ skillLabel(p.type === 'self' ? guardianProfile?.skill_level : null) }}
              </p>
              <p v-if="p.age != null" class="text-xs text-gray-500 mt-1">
                {{ language === 'es' ? 'Edad' : 'Age' }}: {{ p.age }}
                <span v-if="p.dateOfBirth"> · {{ p.dateOfBirth }}</span>
              </p>
              <p v-else class="text-xs text-amber-700 mt-1 font-medium">
                {{
                  language === 'es'
                    ? 'Agrega fecha de nacimiento para inscribir clases'
                    : 'Add date of birth to enroll in classes'
                }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-px bg-teal-600/20">
            <button
              type="button"
              class="bg-white py-3 text-[10px] font-black uppercase hover:bg-gray-50"
              @click="setActive(p.key)"
            >
              {{ activeKey === p.key ? '● ' : '' }}{{ language === 'es' ? 'Ver perfil' : 'View' }}
            </button>
            <button
              type="button"
              class="bg-white py-3 text-[10px] font-black uppercase hover:bg-gray-50"
              @click="openEdit(p.key)"
            >
              {{ language === 'es' ? 'Editar' : 'Edit' }}
            </button>
            <button
              v-if="!p.isYou"
              type="button"
              class="col-span-2 bg-white py-3 text-[10px] font-black uppercase text-red-700 hover:bg-red-50"
              @click="removeMember(p.crewMemberId!)"
            >
              {{ language === 'es' ? 'Eliminar del crew' : 'Remove from crew' }}
            </button>
          </div>
        </article>
      </div>

      <p v-if="formError" class="mt-4 text-sm text-red-600 font-medium">{{ formError }}</p>
    </div>

    <!-- Add / edit modal -->
    <div
      v-if="showForm"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      @click.self="showForm = false"
    >
      <div class="w-full max-w-md bg-white border-[3px] border-black rounded-2xl p-5 shadow-xl">
        <h3 class="text-lg font-black uppercase mb-4">
          {{
            editingKey
              ? language === 'es'
                ? 'Editar perfil'
                : 'Edit profile'
              : language === 'es'
                ? 'Agregar al crew'
                : 'Add to crew'
          }}
        </h3>
        <form class="space-y-3" @submit.prevent="saveForm">
          <label class="block text-xs font-bold uppercase">
            {{ language === 'es' ? 'Nombre' : 'First name' }}
            <input
              v-model="form.first_name"
              required
              class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
            />
          </label>
          <label class="block text-xs font-bold uppercase">
            {{ language === 'es' ? 'Apellido' : 'Last name' }}
            <input
              v-model="form.last_name"
              class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
            />
          </label>
          <label class="block text-xs font-bold uppercase">
            {{ language === 'es' ? 'Fecha de nacimiento' : 'Date of birth' }}
            <input
              v-model="form.date_of_birth"
              type="date"
              class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
            />
          </label>
          <p class="text-xs text-gray-600">
            {{
              language === 'es'
                ? 'La edad determina qué clases puede tomar cada patinador.'
                : 'Age determines which classes each skater can join.'
            }}
          </p>
          <div class="flex gap-2 pt-2">
            <button
              type="button"
              class="flex-1 py-2.5 border-2 border-black rounded-lg font-bold"
              @click="showForm = false"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              type="submit"
              class="flex-1 py-2.5 bg-black text-white rounded-lg font-bold disabled:opacity-50"
              :disabled="saving"
            >
              {{ saving ? '…' : language === 'es' ? 'Guardar' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
