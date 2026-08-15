<script setup lang="ts">
import {
  buildSummerPricingReference,
  formatPriceCell,
  pricingReferenceByTier,
  SEASON_TOTAL_CLASSES,
  fullSeasonGroupPriceMxn,
} from '~/utils/classPricing'

defineProps<{ summerCourse?: boolean }>()

const { language } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const es = computed(() => language.value === 'es')
const tierGroups = computed(() => pricingReferenceByTier(es.value))
const summerRows = computed(() => buildSummerPricingReference(es.value))

const toggle = () => {
  open.value = !open.value
}

const onDocClick = (e: MouseEvent) => {
  if (!open.value || !root.value) return
  if (!root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="relative inline-flex align-middle">
    <button
      type="button"
      class="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-500 text-[10px] font-bold text-gray-400 hover:text-cyan-300 hover:border-cyan-400/60 leading-none shrink-0"
      :aria-label="es ? 'Ver tabla de precios' : 'View pricing table'"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      ?
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full mt-1 z-[200] w-[min(calc(100vw-2rem),440px)] rounded-lg border border-gray-600 bg-gray-900 shadow-2xl p-2.5 text-[10px] text-gray-200 max-h-[min(70vh,420px)] overflow-y-auto"
      @click.stop
    >
      <p class="text-[11px] font-semibold text-white mb-2">
        {{ es ? 'Tabla de precios (MXN)' : 'Pricing table (MXN)' }}
      </p>

      <template v-if="summerCourse">
        <table class="w-full border-collapse">
          <thead>
            <tr class="text-gray-400 uppercase tracking-wide">
              <th class="text-left py-1 pr-2 font-medium">{{ es ? 'Paquete' : 'Package' }}</th>
              <th class="text-right py-1 px-1 font-medium">{{ es ? 'Precio' : 'Price' }}</th>
              <th class="text-right py-1 pl-1 font-medium">{{ es ? '/ día' : '/ day' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in summerRows" :key="row.label" class="border-t border-gray-800">
              <td class="py-1.5 pr-2">{{ row.label }}</td>
              <td class="py-1.5 px-1 text-right text-emerald-300 font-medium tabular-nums">
                {{ formatPriceCell(row.priceMxn, es) }}
              </td>
              <td class="py-1.5 pl-1 text-right text-gray-400 tabular-nums">
                {{ formatPriceCell(row.perDayMxn, es) }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-else>
        <div
          v-for="group in tierGroups"
          :key="group.tier"
          class="mb-3 last:mb-0"
        >
          <p class="text-[10px] font-bold text-cyan-300 uppercase tracking-wide mb-1.5">
            {{ group.label }}
          </p>
          <table class="w-full border-collapse">
            <thead>
              <tr class="text-gray-400 uppercase tracking-wide">
                <th class="text-left py-1 pr-1 font-medium">{{ es ? 'Tipo' : 'Type' }}</th>
                <th class="text-right py-1 px-1 font-medium">{{ es ? 'Precio' : 'Price' }}</th>
                <th class="text-right py-1 px-1 font-medium">{{ es ? 'Final' : 'Final' }}</th>
                <th class="text-center py-1 px-1 font-medium">{{ es ? 'Ses.' : 'Ses.' }}</th>
                <th class="text-right py-1 pl-1 font-medium">{{ es ? 'Desc.' : 'Disc.' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in group.rows"
                :key="`${group.tier}-${row.classType}`"
                class="border-t border-gray-800"
              >
                <td class="py-1.5 pr-1 text-gray-300">{{ row.classType }}</td>
                <td class="py-1.5 px-1 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                  {{ formatPriceCell(row.listMxn, es) }}
                </td>
                <td class="py-1.5 px-1 text-right tabular-nums whitespace-nowrap">
                  <span v-if="row.finalMxn != null" class="text-emerald-300 font-medium">
                    {{ formatPriceCell(row.finalMxn, es) }}
                  </span>
                  <span v-else class="text-gray-600">—</span>
                </td>
                <td class="py-1.5 px-1 text-center text-gray-400 tabular-nums">{{ row.sessions }}</td>
                <td class="py-1.5 pl-1 text-right text-gray-400 tabular-nums">
                  {{ row.discountPct != null ? `${row.discountPct}%` : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-[9px] text-gray-500 mt-2 leading-snug">
          {{
            es
              ? `Temporada completa (${SEASON_TOTAL_CLASSES} clases grupal Principiante): ${formatPriceCell(fullSeasonGroupPriceMxn('principiante'), es)}`
              : `Full season (${SEASON_TOTAL_CLASSES} group classes, Beginner coach): ${formatPriceCell(fullSeasonGroupPriceMxn('principiante'), es)}`
          }}
        </p>
      </template>
    </div>
  </div>
</template>
