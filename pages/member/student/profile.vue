<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const { language } = useI18n()
const {
  participants,
  activeKey,
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
const addAnother = ref(false)

const emptyForm = () => ({
  first_name: '',
  last_name: '',
  date_of_birth: '',
  age: '',
})

const form = ref(emptyForm())

const isEditingSelf = computed(() => editingKey.value === 'self')
const skaterCount = computed(() => crewMembers.value.length)

function openAdd() {
  editingKey.value = null
  form.value = emptyForm()
  formError.value = ''
  addAnother.value = false
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
      age: guardianProfile.value.age != null ? String(guardianProfile.value.age) : '',
    }
  } else {
    const row = crewMembers.value.find(m => m.id === key)
    form.value = {
      first_name: p.firstName,
      last_name: row?.last_name || '',
      date_of_birth: p.dateOfBirth || '',
      age: p.age != null ? String(p.age) : '',
    }
  }
  formError.value = ''
  showForm.value = true
}

function buildPayload() {
  const ageNum = form.value.age.trim() ? Number(form.value.age) : null
  return {
    first_name: form.value.first_name,
    last_name: form.value.last_name,
    date_of_birth: form.value.date_of_birth || null,
    age: ageNum != null && Number.isFinite(ageNum) ? ageNum : null,
  }
}

async function saveForm() {
  formError.value = ''
  saving.value = true
  try {
    const payload = buildPayload()
    if (isEditingSelf.value) {
      await updateGuardianProfile(payload)
      showForm.value = false
    } else if (editingKey.value) {
      await updateCrewMember(editingKey.value, payload)
      showForm.value = false
    } else {
      await addCrewMember(payload)
      if (addAnother.value) {
        form.value = emptyForm()
      } else {
        showForm.value = false
      }
    }
  } catch (e: any) {
    formError.value = e?.message || 'Error'
  } finally {
    saving.value = false
  }
}

async function removeMember(id: string) {
  const ok = confirm(
    language.value === 'es'
      ? '¿Eliminar este patinador de la familia?'
      : 'Remove this skater from your family?',
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
      <div class="flex items-center justify-between gap-3 mb-2">
        <h1 class="text-2xl font-black uppercase tracking-tight">
          {{ language === 'es' ? 'Mi familia' : 'My family' }}
        </h1>
        <button
          type="button"
          class="rounded-full border-2 border-black px-4 py-1.5 text-sm font-bold hover:bg-black hover:text-white transition-colors"
          @click="openAdd"
        >
          + {{ language === 'es' ? 'Patinador' : 'Skater' }}
        </button>
      </div>
      <p class="text-sm text-gray-600 mb-6">
        {{
          language === 'es'
            ? 'Un padre o tutor y uno o más patinadores. La edad de cada uno define qué clases puede tomar en cada temporada.'
            : 'One parent or guardian and one or more skaters. Each skater’s age determines which season classes they can join.'
        }}
      </p>

      <div class="text-center mb-8">
        <div
          class="inline-flex items-center justify-center w-16 h-16 rounded-full border-4 border-teal-600 text-2xl font-black mb-3"
        >
          {{ crewCount }}
        </div>
        <p class="text-sm font-black uppercase tracking-wide text-gray-700">
          {{
            language === 'es'
              ? 'Miembros en tu familia'
              : 'Members in your family'
          }}
        </p>
        <p v-if="skaterCount" class="text-xs text-gray-500 mt-1">
          {{ skaterCount }} {{ language === 'es' ? 'patinador(es)' : 'skater(s)' }}
        </p>
      </div>

      <div v-if="loading" class="h-40 bg-white border-2 border-black rounded-xl animate-pulse" />

      <div v-else class="space-y-4">
        <article
          v-for="p in participants"
          :key="p.key"
          class="border-[3px] rounded-2xl bg-white overflow-hidden"
          :class="p.isYou ? 'border-gray-800' : 'border-teal-600'"
          :style="activeKey === p.key ? { boxShadow: '0 0 0 2px #14b8a6' } : undefined"
        >
          <div class="p-4 border-b-2 flex items-start gap-3" :class="p.isYou ? 'border-gray-200 bg-gray-50' : 'border-teal-600/30'">
            <div
              class="w-14 h-14 rounded-full bg-gray-200 border-2 border-black flex items-center justify-center overflow-hidden shrink-0"
            >
              <img
                v-if="p.avatarUrl"
                :src="p.avatarUrl"
                :alt="p.displayName"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-2xl">{{ p.isYou ? '👤' : '🛹' }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <p v-if="p.isYou" class="text-[10px] font-black uppercase text-gray-500 mb-0.5">
                {{ language === 'es' ? 'Padre / tutor' : 'Parent / guardian' }}
              </p>
              <h2 class="text-lg font-black uppercase leading-tight truncate">
                {{ p.displayName }}
              </h2>
              <p v-if="!p.isYou" class="text-[10px] font-black uppercase text-teal-700 mt-0.5">
                {{ language === 'es' ? 'Patinador' : 'Skater' }}
              </p>
              <p v-if="p.isYou" class="text-xs font-bold uppercase text-gray-600 mt-1">
                {{ skillLabel(guardianProfile?.skill_level) }}
              </p>
              <p v-if="p.age != null" class="text-xs text-gray-500 mt-1">
                {{ language === 'es' ? 'Edad' : 'Age' }}: {{ p.age }}
                <span v-if="p.dateOfBirth"> · {{ p.dateOfBirth }}</span>
              </p>
              <p v-else-if="!p.isYou" class="text-xs text-amber-700 mt-1 font-medium">
                {{
                  language === 'es'
                    ? 'Agrega edad o fecha de nacimiento para inscribir clases'
                    : 'Add age or date of birth to enroll in classes'
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
              {{ activeKey === p.key ? '● ' : '' }}{{ language === 'es' ? 'Seleccionar' : 'Select' }}
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
              {{ language === 'es' ? 'Eliminar patinador' : 'Remove skater' }}
            </button>
          </div>
        </article>
      </div>

      <p v-if="formError" class="mt-4 text-sm text-red-600 font-medium">{{ formError }}</p>
    </div>

    <div
      v-if="showForm"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      @click.self="showForm = false"
    >
      <div class="w-full max-w-md bg-white border-[3px] border-black rounded-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-black uppercase mb-4">
          {{
            editingKey
              ? language === 'es'
                ? 'Editar miembro'
                : 'Edit member'
              : language === 'es'
                ? 'Agregar patinador'
                : 'Add skater'
          }}
        </h3>
        <MemberFamilyMemberForm
          v-model="form"
          :saving="saving"
          :is-parent="isEditingSelf"
          @submit="saveForm"
          @cancel="showForm = false"
        />
        <label
          v-if="!editingKey"
          class="mt-3 flex items-center gap-2 text-xs font-bold uppercase cursor-pointer"
        >
          <input v-model="addAnother" type="checkbox" class="rounded border-2 border-black" />
          {{ language === 'es' ? 'Agregar otro patinador después' : 'Add another skater after saving' }}
        </label>
      </div>
    </div>
  </div>
</template>
