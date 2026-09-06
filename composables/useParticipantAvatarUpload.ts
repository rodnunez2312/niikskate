import type { Ref } from 'vue'

type AvatarTarget =
  | { kind: 'self' }
  | { kind: 'crew'; crewMemberId: string }
  /** Someone else's account, e.g. a linked skater: shown but not editable here. */
  | { kind: 'readonly' }

async function compressToJpegBlob(file: File, maxDim = 512, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        b => {
          if (b) resolve(b)
          else reject(new Error('blob'))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

/** Upload avatar for account holder (profiles) or crew member (crew_members). */
export function useParticipantAvatarUpload(
  target: Ref<AvatarTarget>,
  avatarUrlRef: Ref<string | null>,
) {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const { language } = useI18n()
  const { refreshCrew } = useCrew()

  const uploadingAvatar = ref(false)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  function storageFolder(): string | null {
    const t = target.value
    if (t.kind === 'self' && user.value?.id) return `avatars/${user.value.id}`
    if (t.kind === 'crew') return `avatars/crew/${t.crewMemberId}`
    return null
  }

  async function clearAvatarFolder(folder: string) {
    const { data: files, error } = await client.storage.from('images').list(folder)
    if (error) {
      console.warn('Avatar list:', error)
      return
    }
    if (files?.length) {
      const paths = files.map(f => `${folder}/${f.name}`)
      await client.storage.from('images').remove(paths)
    }
  }

  async function onAvatarFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !user.value?.id) return

    const folder = storageFolder()
    if (!folder) return

    const maxBytes = 8 * 1024 * 1024
    if (file.size > maxBytes) {
      alert(
        language.value === 'es'
          ? 'La imagen es demasiado grande (máx. 8 MB).'
          : 'Image is too large (max 8 MB).',
      )
      input.value = ''
      return
    }

    if (!file.type.startsWith('image/')) {
      alert(language.value === 'es' ? 'Elige un archivo de imagen.' : 'Please choose an image file.')
      input.value = ''
      return
    }

    uploadingAvatar.value = true
    try {
      await clearAvatarFolder(folder)

      let blob: Blob
      try {
        blob = await compressToJpegBlob(file)
      } catch {
        blob = file
      }

      const path = `${folder}/avatar.jpg`
      const { error: upErr } = await client.storage.from('images').upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (upErr) throw upErr

      const { data: pub } = client.storage.from('images').getPublicUrl(path)
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`

      const t = target.value
      if (t.kind === 'self') {
        const { error: dbErr } = await client
          .from('profiles')
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.value.id)
        if (dbErr) throw dbErr
      } else if (t.kind === 'crew') {
        const { error: dbErr } = await client
          .from('crew_members')
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', t.crewMemberId)
          .eq('guardian_user_id', user.value.id)
        if (dbErr) throw dbErr
      }

      avatarUrlRef.value = publicUrl
      await refreshCrew()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'error'
      console.error('Avatar upload:', e)
      alert(
        language.value === 'es'
          ? `No se pudo subir la foto: ${msg}`
          : `Could not upload photo: ${msg}`,
      )
    } finally {
      uploadingAvatar.value = false
      input.value = ''
    }
  }

  function openAvatarPicker() {
    fileInputRef.value?.click()
  }

  async function removeAvatar() {
    if (!user.value?.id || !avatarUrlRef.value) return
    const folder = storageFolder()
    if (!folder) return

    uploadingAvatar.value = true
    try {
      await clearAvatarFolder(folder)
      const t = target.value
      if (t.kind === 'self') {
        const { error } = await client
          .from('profiles')
          .update({ avatar_url: null, updated_at: new Date().toISOString() })
          .eq('id', user.value.id)
        if (error) throw error
      } else if (t.kind === 'crew') {
        const { error } = await client
          .from('crew_members')
          .update({ avatar_url: null, updated_at: new Date().toISOString() })
          .eq('id', t.crewMemberId)
          .eq('guardian_user_id', user.value.id)
        if (error) throw error
      }
      avatarUrlRef.value = null
      await refreshCrew()
    } catch (e) {
      console.error('Remove avatar:', e)
      alert(language.value === 'es' ? 'No se pudo quitar la foto.' : 'Could not remove photo.')
    } finally {
      uploadingAvatar.value = false
    }
  }

  return {
    uploadingAvatar,
    fileInputRef,
    onAvatarFileChange,
    openAvatarPicker,
    removeAvatar,
  }
}
