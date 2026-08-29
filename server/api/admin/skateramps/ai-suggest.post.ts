import { requireAdmin } from '~/server/utils/requireAdmin'
import { parseRampSketch, type RampSketch } from '~/utils/skaterampSketch'

type Body = {
  title?: string
  description?: string
  conceptNotes?: string
  buildNotes?: string
  stage?: string
  sketch?: RampSketch
  imageUrls?: string[]
}

function localRampSuggestions(body: Body): string {
  const sketch = parseRampSketch(body.sketch)
  const es = true
  const lines = [
    `## ${es ? 'Ideas para' : 'Ideas for'} «${body.title || 'Rampa'}»`,
    '',
    `- **${es ? 'Tipo' : 'Type'}:** ${sketch.rampType} · ${sketch.heightFt}ft alto × ${sketch.widthFt}ft ancho`,
    `- **${es ? 'Transición' : 'Transition'}:** radio ~${sketch.transitionRadiusFt}ft — ${sketch.transitionRadiusFt >= sketch.heightFt ? (es ? 'suave para principiantes' : ' mellow for beginners') : (es ? 'más vertical, mejor para intermedio+' : ' steeper, better for intermediate+')}`,
    `- **${es ? 'Materiales' : 'Materials'}:** 2×4 + plywood 3/4" + capa de deslizamiento (Skate Lite / phenolic); coping de tubo 2" schedule 40`,
    `- **${es ? 'Seguridad' : 'Safety'}:** ${es ? 'Zona de caída libre mín. 6ft del coping; considera rail o módulo desmontable para patios.' : 'Min. 6ft fall zone from coping; consider rail or modular sections for backyards.'}`,
  ]
  if (body.description?.trim()) {
    lines.push('', `**${es ? 'Tu idea' : 'Your brief'}:** ${body.description.trim()}`)
  }
  if (sketch.notes?.trim()) {
    lines.push('', `**${es ? 'Notas boceto' : 'Sketch notes'}:** ${sketch.notes.trim()}`)
  }
  if ((body.imageUrls?.length ?? 0) > 0) {
    lines.push('', `- ${es ? 'Revisa las fotos subidas para alinear proporciones y acabados con el cliente.' : 'Review uploaded photos to align proportions and finishes with the client.'}`)
  }
  lines.push(
    '',
    `*${es ? 'Sugerencias locales (sin IA). Agrega OPENAI_API_KEY en Vercel para análisis con fotos.' : 'Local suggestions (no AI). Add OPENAI_API_KEY on Vercel for photo-aware analysis.'}*`,
  )
  return lines.join('\n')
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody(event)) as Body
  const config = useRuntimeConfig()
  const apiKey = (config.openaiApiKey as string)?.trim()

  if (!apiKey) {
    return {
      suggestions: localRampSuggestions(body),
      source: 'local' as const,
    }
  }

  const sketch = parseRampSketch(body.sketch)
  const imageUrls = (body.imageUrls || []).filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, 4)

  const systemPrompt =
    'You are NiikSkate ramp design advisor in Mérida, Mexico. Suggest practical skate ramp ideas: dimensions, materials (plywood, 2x4, coping), skill level, safety, modular options. Respond in Spanish unless user text is English. Use markdown bullets. Be concise (max 12 bullets).'

  const userText = [
    `Title: ${body.title || 'Ramp'}`,
    `Stage: ${body.stage || 'idea'}`,
    `Description: ${body.description || ''}`,
    `Concept notes: ${body.conceptNotes || ''}`,
    `Build notes: ${body.buildNotes || ''}`,
    `Sketch: type=${sketch.rampType}, height=${sketch.heightFt}ft, width=${sketch.widthFt}ft, length=${sketch.lengthFt}ft, transition radius=${sketch.transitionRadiusFt}ft, platform=${sketch.platformDepthFt}ft, notes=${sketch.notes}`,
    imageUrls.length ? `Photos attached: ${imageUrls.length}` : 'No photos attached.',
  ].join('\n')

  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: userText },
  ]
  for (const url of imageUrls) {
    userContent.push({ type: 'image_url', image_url: { url } })
  }

  try {
    const res = await $fetch<{ choices?: Array<{ message?: { content?: string } }> }>(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: {
          model: imageUrls.length ? 'gpt-4o-mini' : 'gpt-4o-mini',
          max_tokens: 900,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        },
      },
    )
    const text = res.choices?.[0]?.message?.content?.trim()
    return {
      suggestions: text || localRampSuggestions(body),
      source: 'openai' as const,
    }
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string } }; message?: string }
    const msg = err?.data?.error?.message || err?.message || 'OpenAI error'
    return {
      suggestions: `${localRampSuggestions(body)}\n\n---\n*OpenAI fallback: ${msg}*`,
      source: 'local' as const,
    }
  }
})
