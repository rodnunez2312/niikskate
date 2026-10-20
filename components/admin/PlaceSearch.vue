<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

type PickedPlace = { placeId: string; name: string; address: string; url: string; lat: number | null; lng: number | null }

const props = defineProps<{
  locationName: string
  formattedAddress: string
  /** A Google place is attached and the address has not been edited since. */
  verified?: boolean
}>()

const emit = defineEmits<{
  'update:locationName': [value: string]
  'update:formattedAddress': [value: string]
  place: [value: PickedPlace]
  clear: []
}>()

/* Minimal shapes of the Places API (New) objects this component touches. */
type LatLng = { lat: () => number; lng: () => number }
type PlaceObject = {
  id?: string
  displayName?: string | null
  formattedAddress?: string | null
  googleMapsURI?: string | null
  location?: LatLng | null
  fetchFields: (req: { fields: string[] }) => Promise<unknown>
}
type PlacePrediction = {
  placeId: string
  text: { text: string }
  mainText?: { text: string } | null
  secondaryText?: { text: string } | null
  toPlace: () => PlaceObject
}
type PlacesLibrary = {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: object) => Promise<{ suggestions: Array<{ placePrediction?: PlacePrediction | null }> }>
  }
  AutocompleteSessionToken: new () => object
}
type MapsWindow = Window & { google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } } }

/** Bias results toward Mérida / Yucatán without excluding the rest of Mexico. */
const BIAS = { center: { lat: 20.97, lng: -89.62 }, radius: 50000 }
const MIN_CHARS = 3

const config = useRuntimeConfig()
const browserKey = computed(() => String(config.public.googleMapsBrowserKey || ''))

const root = ref<HTMLElement | null>(null)
const query = ref(props.formattedAddress || props.locationName)
const predictions = ref<PlacePrediction[]>([])
const open = ref(false)
const activeIndex = ref(-1)
const searching = ref(false)
const picking = ref(false)
const failed = ref(false)
const searchError = ref('')

let places: PlacesLibrary | null = null
let sessionToken: object | null = null
let debounce: ReturnType<typeof setTimeout> | undefined
let requestId = 0

watch(() => props.formattedAddress, (value) => {
  if (value && value !== query.value && !open.value) query.value = value
})

function loadMaps(key: string): Promise<MapsWindow> {
  const win = window as MapsWindow
  if (win.google?.maps?.importLibrary) return Promise.resolve(win)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-niik-places]')
    if (existing) {
      existing.addEventListener('load', () => resolve(win))
      existing.addEventListener('error', () => reject(new Error('maps')))
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places&language=es&region=MX`
    script.async = true
    script.dataset.niikPlaces = '1'
    script.onload = () => resolve(win)
    script.onerror = () => reject(new Error('maps'))
    document.head.appendChild(script)
  })
}

async function ensurePlaces() {
  if (places) return places
  const win = await loadMaps(browserKey.value)
  const lib = await win.google?.maps?.importLibrary?.('places') as PlacesLibrary | undefined
  if (!lib?.AutocompleteSuggestion) throw new Error('places')
  places = lib
  return lib
}

onMounted(() => {
  if (!browserKey.value) return
  ensurePlaces().catch(() => { failed.value = true })
})

onClickOutside(root, () => { open.value = false })

function onInput() {
  emit('update:formattedAddress', query.value)
  if (props.verified) emit('clear')
  searchError.value = ''
  clearTimeout(debounce)
  if (!browserKey.value || failed.value) return
  if (query.value.trim().length < MIN_CHARS) {
    predictions.value = []
    open.value = false
    return
  }
  debounce = setTimeout(search, 250)
}

async function search() {
  const input = query.value.trim()
  const id = ++requestId
  searching.value = true
  try {
    const lib = await ensurePlaces()
    sessionToken ??= new lib.AutocompleteSessionToken()
    const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken,
      includedRegionCodes: ['mx'],
      locationBias: BIAS,
      language: 'es',
    })
    if (id !== requestId) return
    predictions.value = suggestions
      .map(s => s.placePrediction)
      .filter((p): p is PlacePrediction => Boolean(p))
      .slice(0, 6)
    activeIndex.value = predictions.value.length ? 0 : -1
    open.value = true
  } catch {
    if (id !== requestId) return
    predictions.value = []
    searchError.value = 'No se pudo buscar en Google Maps. Revisa que la llave tenga activada "Places API (New)".'
  } finally {
    if (id === requestId) searching.value = false
  }
}

async function pick(prediction: PlacePrediction) {
  open.value = false
  picking.value = true
  query.value = prediction.text.text
  try {
    const place = prediction.toPlace()
    await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'] })
    const name = place.displayName || prediction.mainText?.text || ''
    const address = place.formattedAddress || prediction.text.text
    query.value = address
    emit('update:formattedAddress', address)
    if (name) emit('update:locationName', name)
    emit('place', {
      placeId: place.id || prediction.placeId,
      name,
      address,
      url: place.googleMapsURI || '',
      lat: place.location ? place.location.lat() : null,
      lng: place.location ? place.location.lng() : null,
    })
  } catch {
    searchError.value = 'No se pudo validar la dirección. Intenta de nuevo.'
  } finally {
    sessionToken = null
    picking.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value || !predictions.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % predictions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + predictions.value.length) % predictions.value.length
  } else if (event.key === 'Enter' && activeIndex.value >= 0) {
    event.preventDefault()
    pick(predictions.value[activeIndex.value]!)
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

onBeforeUnmount(() => clearTimeout(debounce))
</script>

<template>
  <div class="space-y-3">
    <div ref="root" class="relative">
      <label for="place-search-address" class="block text-xs text-gray-400 mb-1">Dirección</label>
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        <input
          id="place-search-address"
          v-model="query"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="place-search-list"
          :aria-expanded="open"
          :aria-activedescendant="open && activeIndex >= 0 ? `place-option-${activeIndex}` : undefined"
          class="w-full pl-9 pr-10 py-2.5 rounded-xl bg-gray-800 border text-white text-sm focus:outline-none focus:border-acid"
          :class="verified ? 'border-acid/60' : 'border-gray-700'"
          :placeholder="browserKey && !failed ? 'Escribe calle, colonia o lugar…' : 'Dirección'"
          autocomplete="off"
          @input="onInput"
          @focus="predictions.length && (open = true)"
          @keydown="onKeydown"
        >
        <span class="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
          <span v-if="searching || picking" class="block w-4 h-4 border-2 border-acid border-t-transparent rounded-full animate-spin" />
          <svg v-else-if="verified" class="w-4 h-4 text-acid" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      </div>

      <ul
        v-if="open"
        id="place-search-list"
        role="listbox"
        class="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        <li
          v-for="(prediction, index) in predictions"
          :id="`place-option-${index}`"
          :key="prediction.placeId"
          role="option"
          :aria-selected="index === activeIndex"
          class="flex items-start gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-800 last:border-0"
          :class="index === activeIndex ? 'bg-gray-800' : 'hover:bg-gray-800/60'"
          @mouseenter="activeIndex = index"
          @mousedown.prevent="pick(prediction)"
        >
          <span class="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center" aria-hidden="true">
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-white truncate">{{ prediction.mainText?.text || prediction.text.text }}</span>
            <span v-if="prediction.secondaryText?.text" class="block text-xs text-gray-400 truncate">{{ prediction.secondaryText.text }}</span>
          </span>
        </li>
        <li v-if="!predictions.length" class="px-3 py-3 text-sm text-gray-400">
          Sin resultados. Prueba con la calle y la colonia.
        </li>
        <li class="px-3 py-1.5 text-[10px] text-gray-500 text-right bg-gray-950/60">Google Maps</li>
      </ul>

      <p v-if="verified" class="mt-1 text-[11px] text-acid">Verificada en Google Maps</p>
      <p v-else-if="searchError" class="mt-1 text-[11px] text-amber-200/90">{{ searchError }}</p>
      <p v-else-if="browserKey && !failed && query.trim()" class="mt-1 text-[11px] text-gray-500">Elige una opción de la lista para validar la dirección.</p>
    </div>

    <p v-if="!browserKey || failed" class="text-xs text-amber-200/90 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      {{ browserKey
        ? 'Google Maps no cargó. Escribe la dirección a mano.'
        : 'Falta NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY. Escribe la dirección a mano hasta configurar la llave.' }}
    </p>

    <label class="block">
      <span class="block text-xs text-gray-400 mb-1">Nombre del lugar</span>
      <input
        :value="locationName"
        type="text"
        class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm"
        placeholder="Se llena al elegir una dirección"
        @input="emit('update:locationName', ($event.target as HTMLInputElement).value)"
      >
    </label>
  </div>
</template>
