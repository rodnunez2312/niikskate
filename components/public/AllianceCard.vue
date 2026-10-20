<script setup lang="ts">
import { allianceText, locationLine, partnerTypeLabel, type AllianceRecord } from '~/utils/alliances'

const props = defineProps<{
  alliance: AllianceRecord
}>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const intro = computed(() =>
  allianceText(es.value, props.alliance.short_description || props.alliance.objective, props.alliance.short_description_en || props.alliance.objective_en),
)
const place = computed(() => locationLine(props.alliance))
const initials = computed(() =>
  props.alliance.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'N',
)
</script>

<template>
  <article class="flex h-full flex-col overflow-hidden rounded-3xl border border-cream-200 bg-cream-50">
    <div class="relative h-36 sm:h-40 bg-gradient-to-br from-charcoal to-sage-700">
      <template v-if="alliance.cover_image_url">
        <PublicPhoto
          v-if="alliance.cover_image_url.startsWith('/')"
          :src="alliance.cover_image_url"
          alt=""
          sizes="xs:85vw sm:420px"
          class="absolute inset-0 w-full h-full object-cover"
        />
        <img
          v-else
          :src="alliance.cover_image_url"
          alt=""
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        >
      </template>
      <div class="absolute inset-0 bg-gradient-to-t from-charcoal/40 via-transparent to-transparent" aria-hidden="true" />
    </div>

    <div class="flex flex-1 flex-col px-6 pb-6 sm:px-8 sm:pb-8">
      <div class="-mt-9 flex items-end justify-between gap-3">
        <div class="relative w-[4.5rem] h-[4.5rem] rounded-2xl bg-acid ring-4 ring-cream-50 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          <img
            v-if="alliance.logo_image_url"
            :src="alliance.logo_image_url"
            :alt="alliance.name"
            class="w-full h-full object-contain bg-cream p-1.5"
          >
          <span v-else class="text-3xl" aria-hidden="true">{{ alliance.partner_type === 'school' ? '🏫' : initials }}</span>
        </div>
        <p
          v-if="alliance.founding_partner"
          class="mb-1 inline-flex px-3 py-1 rounded-full bg-sage-100 text-[11px] font-bold uppercase tracking-wide text-sage-700"
        >
          {{ es ? 'Socio educativo fundador' : 'Founding Education Partner' }}
        </p>
        <p v-else class="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">
          {{ partnerTypeLabel(alliance.partner_type, es) }}
        </p>
      </div>

      <h2 class="t-h3 mt-4">{{ alliance.name }}</h2>
      <p v-if="place" class="text-sm text-charcoal/65">{{ place }}</p>
      <p v-if="intro" class="t-lead mt-5 text-charcoal/80">{{ intro }}</p>
      <NuxtLink
        :to="`/alianzas/${alliance.slug}`"
        class="mt-auto pt-6 inline-flex text-sm font-bold text-charcoal link-underline decoration-acid-600"
      >
        {{ es ? 'Ver alianza' : 'View partnership' }}
      </NuxtLink>
    </div>
  </article>
</template>
