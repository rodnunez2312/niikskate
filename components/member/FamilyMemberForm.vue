<script setup lang="ts">
import { computeAgeFromDob } from '~/utils/ageEligibility'

const props = withDefaults(
  defineProps<{
    modelValue: {
      first_name: string
      last_name: string
      date_of_birth: string
      age: string
    }
    saving?: boolean
    isParent?: boolean
  }>(),
  {
    saving: false,
    isParent: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: typeof props.modelValue]
  submit: []
  cancel: []
}>()

const { language } = useI18n()

const local = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const computedAge = computed(() => {
  if (local.value.date_of_birth) {
    return computeAgeFromDob(local.value.date_of_birth, null)
  }
  const n = Number(local.value.age)
  return Number.isFinite(n) && n >= 0 ? n : null
})

function patch(field: keyof typeof props.modelValue, value: string) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="emit('submit')">
    <label class="block text-xs font-bold uppercase">
      {{ language === 'es' ? 'Nombre' : 'First name' }}
      <input
        :value="local.first_name"
        required
        class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
        @input="patch('first_name', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="block text-xs font-bold uppercase">
      {{ language === 'es' ? 'Apellido' : 'Last name' }}
      <input
        :value="local.last_name"
        class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
        @input="patch('last_name', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="block text-xs font-bold uppercase">
        {{ language === 'es' ? 'Edad' : 'Age' }}
        <input
          :value="local.age"
          type="number"
          min="0"
          max="120"
          :placeholder="language === 'es' ? 'Ej. 8' : 'e.g. 8'"
          class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
          @input="patch('age', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="block text-xs font-bold uppercase">
        {{ language === 'es' ? 'Fecha de nacimiento' : 'Date of birth' }}
        <input
          :value="local.date_of_birth"
          type="date"
          class="mt-1 w-full border-2 border-black rounded-lg px-3 py-2 font-medium normal-case"
          @input="patch('date_of_birth', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <p v-if="computedAge != null" class="text-xs text-teal-700 font-medium">
      {{ language === 'es' ? 'Edad para clases:' : 'Age for classes:' }} {{ computedAge }}
      {{ language === 'es' ? 'años' : 'years' }}
    </p>
    <p class="text-xs text-gray-600">
      {{
        isParent
          ? language === 'es'
            ? 'Datos del padre o tutor responsable de la familia.'
            : 'Parent or guardian responsible for the family account.'
          : language === 'es'
            ? 'Indica edad o fecha de nacimiento para filtrar clases por temporada.'
            : 'Enter age or date of birth to filter season classes.'
      }}
    </p>
    <div class="flex gap-2 pt-2">
      <button
        type="button"
        class="flex-1 py-2.5 border-2 border-black rounded-lg font-bold"
        @click="emit('cancel')"
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
</template>
