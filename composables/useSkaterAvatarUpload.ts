import type { Ref } from 'vue'

type ProfileWithAvatar = { avatar_url?: string | null } | null

/**
 * Skater profile photo: Supabase Storage `images` bucket at avatars/{userId}/avatar.jpg
 * + profiles.avatar_url. One image per user; folder cleared before replace.
 */
export function useSkaterAvatarUpload(profileRef: Ref<ProfileWithAvatar>) {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const { language } = useI18n()

  const uploadingAvatar = ref(false)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  async function clearAvatarFolder(uid: string) {
    const folder = `avatars/${uid}`
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
          quality
        )
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('image'))
      }
      img.src = url
    })
  }

  async function onAvatarFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !user.value?.id) return

    const maxBytes = 8 * 1024 * 1024
    if (file.size > maxBytes) {
      alert(
        language.value === 'es'
          ? 'La imagen es demasiado grande (máx. 8 MB).'
          : 'Image is too large (max 8 MB).'
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
      await clearAvatarFolder(user.value.id)

      let blob: Blob
      try {
        blob = await compressToJpegBlob(file)
      } catch {
        blob = file
      }
      const path = `avatars/${user.value.id}/avatar.jpg`
      const { error: upErr } = await client.storage.from('images').upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (upErr) throw upErr

      const { data: pub } = client.storage.from('images').getPublicUrl(path)
      const publicUrl = pub.publicUrl

      const { error: dbErr } = await client
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.value.id)

      if (dbErr) throw dbErr

      if (profileRef.value) profileRef.value.avatar_url = publicUrl
      else profileRef.value = { avatar_url: publicUrl }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'error'
      console.error('Avatar upload:', e)
      alert(
        language.value === 'es'
          ? `No se pudo subir la foto: ${msg}`
          : `Could not upload photo: ${msg}`
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
    if (!user.value?.id || !profileRef.value?.avatar_url) return
    uploadingAvatar.value = true
    try {
      await clearAvatarFolder(user.value.id)
      const { error } = await client
        .from('profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', user.value.id)
      if (error) throw error
      if (profileRef.value) profileRef.value.avatar_url = null
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
