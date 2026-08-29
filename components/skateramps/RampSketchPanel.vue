<script setup lang="ts">
import {
  DEFAULT_RAMP_SKETCH,
  RAMP_TYPE_OPTIONS,
  rampSketchSvg,
  type RampSketch,
} from '~/utils/skaterampSketch'

const sketch = defineModel<RampSketch>({ required: true })
const { language } = useI18n()

const es = computed(() => language.value === 'es')
const svgMarkup = computed(() => rampSketchSvg(sketch.value))
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-4">
    <div class="space-y-3 rounded-xl border border-gray-700 bg-gray-900/50 p-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1">
          {{ es ? 'Tipo de rampa' : 'Ramp type' }}
        </label>
        <select
          v-model="sketch.rampType"
          class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
        >
          <option v-for="opt in RAMP_TYPE_OPTIONS" :key="opt.id" :value="opt.id">
            {{ es ? opt.label.es : opt.label.en }}
          </option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Alto (ft)' : 'Height (ft)' }}</label>
          <input v-model.number="sketch.heightFt" type="number" min="1" max="14" step="0.5" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Ancho (ft)' : 'Width (ft)' }}</label>
          <input v-model.number="sketch.widthFt" type="number" min="4" max="24" step="0.5" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Largo (ft)' : 'Length (ft)' }}</label>
          <input v-model.number="sketch.lengthFt" type="number" min="4" max="40" step="0.5" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Radio transición (ft)' : 'Transition radius (ft)' }}</label>
          <input v-model.number="sketch.transitionRadiusFt" type="number" min="2" max="12" step="0.5" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Plataforma superior (ft)' : 'Deck / platform (ft)' }}</label>
          <input v-model.number="sketch.platformDepthFt" type="number" min="0" max="8" step="0.5" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" />
        </div>
      </div>

      <div>
        <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Notas del boceto' : 'Sketch notes' }}</label>
        <textarea
          v-model="sketch.notes"
          rows="3"
          class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
          :placeholder="es ? 'Coping, materiales, nivel del skater…' : 'Coping, materials, skater level…'"
        />
      </div>

      <button
        type="button"
        class="text-xs text-gray-500 hover:text-gray-300"
        @click="Object.assign(sketch, { ...DEFAULT_RAMP_SKETCH })"
      >
        {{ es ? 'Restablecer boceto' : 'Reset sketch' }}
      </button>
    </div>

    <div class="rounded-xl border border-cyan-500/30 bg-gray-950 p-3 flex flex-col">
      <p class="text-xs font-bold uppercase tracking-wide text-cyan-400 mb-2">
        {{ es ? 'Vista lateral (boceto)' : 'Side view (sketch)' }}
      </p>
      <div class="flex-1 flex items-center justify-center min-h-[180px]" v-html="svgMarkup" />
      <p class="text-[10px] text-gray-500 mt-2 text-center">
        {{ es ? 'Proporcional — no es plano de construcción.' : 'Proportional preview — not a construction blueprint.' }}
      </p>
    </div>
  </div>
</template>
