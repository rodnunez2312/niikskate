<script setup lang="ts">
import { CONTACT_EMAIL } from '~/utils/contact'
import { activityTypeLabel, allianceText, locationLine, mapsHref, partnerTypeLabel, type AllianceRecord } from '~/utils/alliances'

const props = defineProps<{
  alliance: AllianceRecord
}>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')
const place = computed(() => locationLine(props.alliance))
const mapLink = computed(() => mapsHref(props.alliance))
const objective = computed(() => allianceText(es.value, props.alliance.objective, props.alliance.objective_en))
const intro = computed(() => allianceText(es.value, props.alliance.short_description, props.alliance.short_description_en))
const areas = computed(() =>
  [...props.alliance.areas]
    .sort((a, b) => a.display_order - b.display_order)
    .filter(area => area.title.trim() || area.details.trim() || area.image_url),
)
const initials = computed(() =>
  props.alliance.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'N',
)
const mailto = computed(() =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(es.value ? `Alianza con ${props.alliance.name}` : `Partnership with ${props.alliance.name}`)}`,
)
</script>

<template>
  <article class="rounded-3xl border border-cream-200 bg-cream-50 p-6 sm:p-10">
    <div class="flex items-start gap-4">
      <div class="w-14 h-14 rounded-2xl bg-acid flex items-center justify-center shrink-0 overflow-hidden">
        <img
          v-if="alliance.logo_image_url"
          :src="alliance.logo_image_url"
          :alt="alliance.name"
          class="w-full h-full object-contain bg-cream p-1.5"
        >
        <span v-else class="text-2xl" aria-hidden="true">{{ alliance.partner_type === 'school' ? '🏫' : initials }}</span>
      </div>
      <div class="min-w-0">
        <p
          v-if="alliance.founding_partner"
          class="inline-flex px-3 py-1 rounded-full bg-sage-100 text-[11px] font-bold uppercase tracking-wide text-sage-700"
        >
          {{ es ? 'Socio educativo fundador' : 'Founding Education Partner' }}
        </p>
        <p v-else class="text-[11px] font-bold uppercase tracking-wide text-charcoal/50">
          {{ partnerTypeLabel(alliance.partner_type, es) }}
        </p>
        <h1 class="t-h3 mt-2">{{ alliance.name }}</h1>
        <p v-if="place" class="text-sm text-charcoal/65">
          <a v-if="mapLink" :href="mapLink" target="_blank" rel="noopener" class="link-underline">{{ place }}</a>
          <span v-else>{{ place }}</span>
        </p>
      </div>
    </div>

    <p v-if="intro && intro !== objective" class="t-lead mt-6 text-charcoal/80 max-w-3xl">{{ intro }}</p>
    <p v-if="objective" class="mt-4 text-charcoal/80 leading-relaxed max-w-3xl whitespace-pre-wrap">{{ objective }}</p>

    <div v-if="alliance.cover_image_url" class="mt-8 overflow-hidden rounded-2xl bg-cream-200">
      <PublicPhoto
        v-if="alliance.cover_image_url.startsWith('/')"
        :src="alliance.cover_image_url"
        :alt="alliance.name"
        sizes="xs:100vw lg:960px"
        class="w-full aspect-[16/8] object-cover"
        priority
      />
      <img
        v-else
        :src="alliance.cover_image_url"
        :alt="alliance.name"
        class="w-full aspect-[16/8] object-cover"
      >
    </div>

    <div v-if="areas.length" class="mt-10 grid sm:grid-cols-2 gap-8">
      <article v-for="area in areas" :key="area.id || area.title" class="group">
        <div v-if="area.image_url" class="overflow-hidden rounded-2xl bg-cream-200">
          <PublicPhoto
            v-if="area.image_url.startsWith('/')"
            :src="area.image_url"
            :alt="area.image_alt || allianceText(es, area.title, area.title_en)"
            sizes="xs:100vw sm:50vw lg:480px"
            class="w-full aspect-[16/10] object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
          />
          <img
            v-else
            :src="area.image_url"
            :alt="area.image_alt || allianceText(es, area.title, area.title_en)"
            class="w-full aspect-[16/10] object-cover"
            loading="lazy"
          >
        </div>
        <p class="mt-4 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">
          {{ activityTypeLabel(area.activity_type, es) }}
        </p>
        <h2 class="font-display text-xl font-extrabold mt-1">{{ allianceText(es, area.title, area.title_en) }}</h2>
        <p class="mt-1.5 text-charcoal/75 leading-relaxed whitespace-pre-wrap">{{ allianceText(es, area.details, area.details_en) }}</p>
      </article>
    </div>

    <div class="mt-10 flex flex-wrap gap-3">
      <a v-if="alliance.external_website_url" :href="alliance.external_website_url" target="_blank" rel="noopener" class="btn-outline">
        {{ es ? 'Sitio del aliado' : 'Partner website' }}
      </a>
      <a :href="mailto" class="btn-lime">
        {{ es ? 'Hablar de una alianza' : 'Discuss a partnership' }}
      </a>
    </div>
  </article>
</template>
