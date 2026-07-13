import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { upload } from '@imagekit/react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { getImageKitAuth } from '@/server/actions/ThirdParty/ImageKit/imagekit.service'
import { uploadAvatarFn, updateProfile, updateDisplayName } from '@/server/actions/Database/services/user.service'
import { clientEnv } from '@/lib/env/client-env'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  /** Passed the new nickname when it changed, so the caller can navigate off the now-stale /profile/$nickname URL. */
  onSaved: (newNickname?: string) => void
  initial: {
    name: string
    nickname: string
    bio: string | null
    website: string | null
    location: string | null
    avatarUrl: string | null
    hideEngagementCounts: boolean
  }
  initials: string
}

export function EditProfileModal({ isOpen, onClose, onSaved, initial, initials }: EditProfileModalProps) {
  const [name, setName] = useState(initial.name)
  const [nickname, setNickname] = useState(initial.nickname)
  const [bio, setBio] = useState(initial.bio ?? '')
  const [website, setWebsite] = useState(initial.website ?? '')
  const [location, setLocation] = useState(initial.location ?? '')
  const [hideEngagementCounts, setHideEngagementCounts] = useState(initial.hideEngagementCounts)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (name.trim() !== initial.name || nickname.trim() !== initial.nickname) {
        const nameRes = await updateDisplayName({ data: { name: name.trim(), nickname: nickname.trim() } })
        if (!nameRes.ok) throw new Error(nameRes.message)
      }

      let imageMediaId: string | undefined

      if (avatarFile) {
        const auth = await getImageKitAuth({
          data: {
            mimeType: avatarFile.type,
            fileSizeBytes: avatarFile.size,
            fileName: avatarFile.name,
          },
        })
        const response = await upload({
          file: avatarFile,
          fileName: avatarFile.name,
          token: auth.token,
          signature: auth.signature,
          expire: auth.expire,
          publicKey: clientEnv.imagekitPublicKey,
        })
        if (!response?.filePath) throw new Error('Avatar upload failed')

        const mediaRes = await uploadAvatarFn({
          data: {
            mediaUrl: response.filePath.replace(/^\//, ''),
            fileName: avatarFile.name,
            mimeType: avatarFile.type,
            fileSize: avatarFile.size,
            width: response.width ?? undefined,
            height: response.height ?? undefined,
          },
        })
        if (!mediaRes.ok) throw new Error(mediaRes.message)
        imageMediaId = mediaRes.data.mediaId
      }

      const res = await updateProfile({
        data: {
          bio: bio.trim() || undefined,
          website: website.trim() || undefined,
          location: location.trim() || undefined,
          hideEngagementCounts,
          imageMediaId,
        },
      })
      if (!res.ok) throw new Error(res.message)
    },
    onSuccess: () => {
      onSaved(nickname.trim() !== initial.nickname ? nickname.trim() : undefined)
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Failed to save profile'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit profile">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full shrink-0 group overflow-hidden bg-accent-bg text-accent flex items-center justify-center text-2xl font-bold"
            aria-label="Change avatar"
          >
            {avatarPreview || initial.avatarUrl ? (
              <img src={avatarPreview ?? initial.avatarUrl!} alt="" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <p className="text-sm text-text-s">Click the avatar to change your photo.</p>
        </div>

        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />

        <div>
          <Input
            label="Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            maxLength={30}
          />
          <p className="text-xs text-text-s mt-1">
            Your handle — shown as @{nickname || '...'}. Avoid using anything identifying, like part of your email.
          </p>
        </div>

        <Textarea
          label="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 160))}
          rows={3}
          placeholder="Tell people a little about yourself"
        />
        <p className="text-xs text-text-s -mt-4 text-right">{bio.length}/160</p>

        <Input
          label="Website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
        />

        <Input
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, Country"
        />

        <label className="flex items-start gap-3 pt-2 border-t border-border cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={hideEngagementCounts}
            onClick={() => setHideEngagementCounts((v) => !v)}
            className={cn(
              'relative mt-0.5 w-10 h-6 rounded-full shrink-0 transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
              hideEngagementCounts ? 'bg-brand' : 'bg-border'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
                hideEngagementCounts && 'translate-x-4'
              )}
            />
          </button>
          <span className="text-sm text-text">
            <span className="font-semibold">Hide like, comment and view counts</span>
            <br />
            <span className="text-text-s">Others still see icons on your posts, just not the numbers — for you too. An aware-intention preference, not a change to what's stored.</span>
          </span>
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} isPending={saveMutation.isPending}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}
