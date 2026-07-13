import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Key, KeyRound, Search, UserCog, ShieldOff, UserX, BellOff, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  getMyGlobalPermissionFn,
  generateRoleKeyFn,
  redeemRoleKeyFn,
  assignGlobalModeratorFn,
  revokeGlobalRoleFn,
} from '@/server/actions/Database/services/role.service'
import { searchUsersByNicknameFn } from '@/server/actions/Database/services/user.service'
import { getBlockedUsersFn, unblockUserFn } from '@/server/actions/Database/services/block.service'
import { getNotificationPreferencesFn, updateNotificationPreferenceFn } from '@/server/actions/Database/services/notification.service'
import { getMutedKeywordsFn, addMutedKeywordFn, removeMutedKeywordFn } from '@/server/actions/Database/services/mutedKeyword.service'

const NOTIFICATION_TYPES = [
  { type: 'like', label: 'Likes' },
  { type: 'comment', label: 'Comments' },
  { type: 'reply', label: 'Replies' },
  { type: 'follow', label: 'New followers' },
  { type: 'mention', label: 'Mentions' },
] as const

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})

function RedeemKeySection() {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  const redeemMutation = useMutation({
    mutationFn: () => redeemRoleKeyFn({ data: { code } }),
    onSuccess: (res) => {
      setMessage(res.ok ? `Success — you are now ${res.data.role}.` : res.message)
      if (res.ok) setCode('')
    },
    onError: () => setMessage('An error occurred — please try again.'),
  })

  return (
    <section className="bg-surface border border-border rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <Key className="w-5 h-5 text-text-h" />
        <h2 className="text-lg font-semibold text-text-h">Redeem a role key</h2>
      </div>
      <p className="text-text-s">Have a one-time admin or moderator key? Enter it below.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. ADM-xxxxxxxx"
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
        />
        <Button
          onClick={() => redeemMutation.mutate()}
          isPending={redeemMutation.isPending}
          disabled={!code.trim()}
        >
          Redeem key
        </Button>
      </div>
      {message && (
        <p className={cn("text-sm", redeemMutation.isError ? "text-danger" : "text-accent")}>
          {message}
        </p>
      )}
    </section>
  )
}

function GenerateKeySection() {
  const [role, setRole] = useState<'admin' | 'senior_moderator' | 'moderator'>('moderator')
  const [generatedCode, setGeneratedCode] = useState('')
  const [error, setError] = useState('')

  const generateMutation = useMutation({
    mutationFn: () => generateRoleKeyFn({ data: { role } }),
    onSuccess: (res) => {
      if (res.ok) {
        setGeneratedCode(res.data.code)
        setError('')
      } else {
        setError(res.message)
        setGeneratedCode('')
      }
    },
    onError: () => setError('An error occurred — please try again.'),
  })

  return (
    <section className="bg-surface border border-border rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <KeyRound className="w-5 h-5 text-text-h" />
        <h2 className="text-lg font-semibold text-text-h">Generate a role key</h2>
      </div>
      <p className="text-text-s">Create a one-time key someone else can redeem to become an admin or moderator.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
        >
          <option value="moderator">Moderator</option>
          <option value="senior_moderator">Senior moderator</option>
          <option value="admin">Admin</option>
        </select>
        <Button onClick={() => generateMutation.mutate()} isPending={generateMutation.isPending}>
          Generate key
        </Button>
      </div>
      {generatedCode && (
        <div className="p-3 bg-accent-bg border border-accent-border rounded-md">
          <p className="text-sm text-text">
            Key (shown once — copy it now): <code className="font-mono font-bold text-accent">{generatedCode}</code>
          </p>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  )
}

function ModeratorSearchSection() {
  const [query, setQuery] = useState('')
  const [assignMessage, setAssignMessage] = useState('')
  const queryClient = useQueryClient()

  const searchQuery = useQuery({
    queryKey: ['userSearch', query],
    queryFn: () => searchUsersByNicknameFn({ data: { query } }),
    enabled: query.trim().length > 0,
  })

  const assignMutation = useMutation({
    mutationFn: (vars: { targetUserId: string; level: 'moderator' | 'senior_moderator' }) =>
      assignGlobalModeratorFn({ data: vars }),
    onSuccess: (res) => {
      setAssignMessage(res.ok ? `Assigned ${res.data.level}.` : res.message)
      queryClient.invalidateQueries({ queryKey: ['userSearch'] })
    },
    onError: () => setAssignMessage('An error occurred — please try again.'),
  })

  const revokeMutation = useMutation({
    mutationFn: (targetUserId: string) => revokeGlobalRoleFn({ data: { targetUserId } }),
    onSuccess: (res) => {
      setAssignMessage(res.ok ? 'Role revoked.' : res.message)
      queryClient.invalidateQueries({ queryKey: ['userSearch'] })
    },
    onError: () => setAssignMessage('An error occurred — please try again.'),
  })

  return (
    <section className="bg-surface border border-border rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <Search className="w-5 h-5 text-text-h" />
        <h2 className="text-lg font-semibold text-text-h">Find a user to promote to moderator</h2>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search nickname…"
        className="w-full bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
      />
      {searchQuery.data && (
        <ul className="space-y-2">
          {searchQuery.data.map((u) => (
            <li
              key={u.userId}
              className="flex items-center justify-between gap-4 p-3 bg-bg border border-border rounded-md transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            >
              <div className="flex items-center gap-2 text-text">
                <UserCog className="w-4 h-4 opacity-60" />
                <span className="font-medium">{u.nickname ?? u.name}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => assignMutation.mutate({ targetUserId: u.userId, level: 'moderator' })}
                  isPending={assignMutation.isPending}
                >
                  Make moderator
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => assignMutation.mutate({ targetUserId: u.userId, level: 'senior_moderator' })}
                  isPending={assignMutation.isPending}
                >
                  Make senior moderator
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revokeMutation.mutate(u.userId)}
                  isPending={revokeMutation.isPending}
                  title="Revoke this user's site role, if they have one"
                >
                  <ShieldOff className="w-4 h-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {assignMessage && (
        <p className={cn("text-sm", (assignMutation.isError || revokeMutation.isError) ? "text-danger" : "text-accent")}>
          {assignMessage}
        </p>
      )}
    </section>
  )
}

function BlockedUsersSection() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')

  const blockedQuery = useQuery({
    queryKey: ['blockedUsers'],
    queryFn: () => getBlockedUsersFn(),
  })

  const unblockMutation = useMutation({
    mutationFn: (targetUserId: string) => unblockUserFn({ data: { targetUserId } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['blockedUsers'] })
      } else {
        setMessage(res.message)
      }
    },
    onError: () => setMessage('An error occurred — please try again.'),
  })

  const blocked = blockedQuery.data ?? []
  if (!blockedQuery.isLoading && blocked.length === 0) return null

  return (
    <section className="bg-surface border border-border rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <UserX className="w-5 h-5 text-text-h" />
        <h2 className="text-lg font-semibold text-text-h">Blocked users</h2>
      </div>
      <p className="text-text-s">People you've blocked won't see your posts or be able to interact with you.</p>
      {blocked.length > 0 && (
        <ul className="space-y-2">
          {blocked.map((u) => (
            <li
              key={u.userId}
              className="flex items-center justify-between gap-4 p-3 bg-bg border border-border rounded-md transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            >
              <span className="font-medium text-text">{u.nickname ?? u.name}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => unblockMutation.mutate(u.userId)}
                isPending={unblockMutation.isPending}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="text-sm text-danger">{message}</p>}
    </section>
  )
}

type NotificationPreference = { type: string; enabled: boolean }
const PREFS_KEY = ['notificationPreferences']

function NotificationPreferencesSection() {
  const queryClient = useQueryClient()

  const prefsQuery = useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => getNotificationPreferencesFn(),
  })

  const updateMutation = useMutation({
    mutationFn: (vars: { type: typeof NOTIFICATION_TYPES[number]['type']; enabled: boolean }) =>
      updateNotificationPreferenceFn({ data: vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY })
      const previous = queryClient.getQueryData<NotificationPreference[]>(PREFS_KEY)
      queryClient.setQueryData<NotificationPreference[]>(PREFS_KEY, (old = []) => {
        const rest = old.filter((p) => p.type !== vars.type)
        return [...rest, { type: vars.type, enabled: vars.enabled }]
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(PREFS_KEY, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PREFS_KEY }),
  })

  const isEnabled = (type: string) => prefsQuery.data?.find((p) => p.type === type)?.enabled ?? true

  return (
    <section className="bg-surface border border-border rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <BellOff className="w-5 h-5 text-text-h" />
        <h2 className="text-lg font-semibold text-text-h">Notifications</h2>
      </div>
      <p className="text-text-s">Choose which activity notifies you. Off just means quieter — nothing is deleted or hidden from anyone else.</p>
      <ul className="space-y-2">
        {NOTIFICATION_TYPES.map(({ type, label }) => (
          <li key={type} className="flex items-center justify-between gap-4 p-3 bg-bg border border-border rounded-md">
            <span className="text-sm font-medium text-text">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled(type)}
              onClick={() => updateMutation.mutate({ type, enabled: !isEnabled(type) })}
              className={cn(
                'relative w-10 h-6 rounded-full shrink-0 transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
                isEnabled(type) ? 'bg-brand' : 'bg-border'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
                  isEnabled(type) && 'translate-x-4'
                )}
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

type MutedKeyword = { id: string; keyword: string }
const MUTED_KEYWORDS_KEY = ['mutedKeywords']

function MutedKeywordsSection() {
  const [keyword, setKeyword] = useState('')
  const queryClient = useQueryClient()

  const keywordsQuery = useQuery({
    queryKey: MUTED_KEYWORDS_KEY,
    queryFn: () => getMutedKeywordsFn(),
  })

  const addMutation = useMutation({
    mutationFn: (kw: string) => addMutedKeywordFn({ data: { keyword: kw } }),
    onMutate: async (kw) => {
      await queryClient.cancelQueries({ queryKey: MUTED_KEYWORDS_KEY })
      const previous = queryClient.getQueryData<MutedKeyword[]>(MUTED_KEYWORDS_KEY)
      const tempId = `temp-${Date.now()}`
      queryClient.setQueryData<MutedKeyword[]>(MUTED_KEYWORDS_KEY, (old = []) => [...old, { id: tempId, keyword: kw }])
      setKeyword('')
      return { previous }
    },
    onError: (_err, _kw, context) => {
      if (context?.previous) queryClient.setQueryData(MUTED_KEYWORDS_KEY, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MUTED_KEYWORDS_KEY }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeMutedKeywordFn({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: MUTED_KEYWORDS_KEY })
      const previous = queryClient.getQueryData<MutedKeyword[]>(MUTED_KEYWORDS_KEY)
      queryClient.setQueryData<MutedKeyword[]>(MUTED_KEYWORDS_KEY, (old = []) => old.filter((k) => k.id !== id))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(MUTED_KEYWORDS_KEY, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MUTED_KEYWORDS_KEY }),
  })

  return (
    <section className="bg-surface border border-border rounded-lg p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <Tag className="w-5 h-5 text-text-h" />
        <h2 className="text-lg font-semibold text-text-h">Muted keywords</h2>
      </div>
      <p className="text-text-s">Posts containing a muted word are quietly left out of your feed — only yours, never a global filter.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. spoilers"
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
        />
        <Button
          onClick={() => addMutation.mutate(keyword.trim())}
          isPending={addMutation.isPending}
          disabled={!keyword.trim()}
        >
          Mute
        </Button>
      </div>
      {keywordsQuery.data && keywordsQuery.data.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {keywordsQuery.data.map((k) => (
            <li
              key={k.id}
              className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-bg border border-border rounded-full text-sm text-text"
            >
              {k.keyword}
              <button
                onClick={() => removeMutation.mutate(k.id)}
                aria-label={`Unmute ${k.keyword}`}
                className="text-text-s hover:text-danger"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SettingsPage() {
  const permQuery = useQuery({
    queryKey: ['myGlobalPermission'],
    queryFn: () => getMyGlobalPermissionFn(),
  })

  const canAssignModerator = permQuery.data?.authorized && permQuery.data.canAssignModerator

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-text-h">Settings</h1>
      </header>
      <div className="space-y-6">
        <NotificationPreferencesSection />
        <MutedKeywordsSection />
        <BlockedUsersSection />
        <RedeemKeySection />
        {canAssignModerator && (
          <>
            <GenerateKeySection />
            <ModeratorSearchSection />
          </>
        )}
      </div>
    </div>
  )
}
