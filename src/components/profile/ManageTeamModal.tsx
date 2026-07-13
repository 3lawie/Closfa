import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { searchUsersByNicknameFn } from '@/server/actions/Database/services/user.service'
import {
  assignModerator,
  removeModerator,
  getModeratorsFn,
  getMyProfilePermissionFn,
} from '@/server/actions/Database/services/moderation.service'
import { cn } from '@/lib/utils/cn'
import { Search, UserCog } from 'lucide-react'

interface ManageTeamModalProps {
  isOpen: boolean
  onClose: () => void
  profileId: string
  currentUserId: string
}

type AssignableRole = 'moderator' | 'vip_moderator' | 'co_owner'
const ASSIGNABLE_ROLES: { value: AssignableRole; label: string }[] = [
  { value: 'moderator', label: 'Moderator' },
  { value: 'vip_moderator', label: 'VIP moderator' },
  { value: 'co_owner', label: 'Co-owner' },
]

const ROSTER_KEY = (profileId: string) => ['profileModerators', profileId]

export function ManageTeamModal({ isOpen, onClose, profileId, currentUserId }: ManageTeamModalProps) {
  const [query, setQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<AssignableRole>('moderator')
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()

  const permQuery = useQuery({
    queryKey: ['myProfilePermission', profileId],
    queryFn: () => getMyProfilePermissionFn({ data: { profileId } }),
    enabled: isOpen,
  })
  const canManage = permQuery.data?.authorized && permQuery.data.canAssignModerator

  const rosterQuery = useQuery({
    queryKey: ROSTER_KEY(profileId),
    queryFn: () => getModeratorsFn({ data: { profileId } }),
    enabled: isOpen,
  })
  const roster = rosterQuery.data?.ok ? rosterQuery.data.data : []

  const searchQuery = useQuery({
    queryKey: ['userSearch', query],
    queryFn: () => searchUsersByNicknameFn({ data: { query } }),
    enabled: isOpen && query.trim().length > 0,
  })

  const assignMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      assignModerator({ data: { targetUserId, profileId, role: selectedRole } }),
    onSuccess: (res) => {
      setMessage(res.ok ? `Assigned ${selectedRole.replace('_', ' ')}.` : res.message)
      if (res.ok) queryClient.invalidateQueries({ queryKey: ROSTER_KEY(profileId) })
    },
    onError: () => setMessage('An error occurred — please try again.'),
  })

  const removeMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      removeModerator({ data: { targetUserId, profileId } }),
    onSuccess: (res) => {
      setMessage(res.ok ? 'Removed from team.' : res.message)
      if (res.ok) queryClient.invalidateQueries({ queryKey: ROSTER_KEY(profileId) })
    },
    onError: () => setMessage('An error occurred — please try again.'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage team">
      <div className="flex flex-col gap-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text-h">Current team</h3>
          {rosterQuery.isLoading ? (
            <p className="text-sm text-text-s">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-text-s">No team members yet.</p>
          ) : (
            <ul className="space-y-2">
              {roster.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-4 p-3 bg-bg border border-border rounded-md"
                >
                  <div className="flex items-center gap-2 text-text">
                    <UserCog className="w-4 h-4 opacity-60" />
                    <span className="font-medium">{m.user?.nickname ?? m.user?.name}</span>
                    <span className="text-xs text-text-s capitalize">({m.role.replace('_', ' ')})</span>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate(m.userId)}
                      isPending={removeMutation.isPending}
                    >
                      {m.userId === currentUserId ? 'Leave' : 'Remove'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && (
          <section className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-text-h" />
              <h3 className="text-sm font-semibold text-text-h">Add a team member</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nickname…"
                className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              />
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as AssignableRole)}
                className="bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent-border"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {searchQuery.data && (
              <ul className="space-y-2">
                {searchQuery.data.map((u) => (
                  <li
                    key={u.userId}
                    className="flex items-center justify-between gap-4 p-3 bg-bg border border-border rounded-md"
                  >
                    <span className="font-medium text-text">{u.nickname ?? u.name}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => assignMutation.mutate(u.userId)}
                      isPending={assignMutation.isPending}
                    >
                      Add as {ASSIGNABLE_ROLES.find((r) => r.value === selectedRole)?.label.toLowerCase()}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {message && (
          <p className={cn('text-sm', (assignMutation.isError || removeMutation.isError) ? 'text-danger' : 'text-accent')}>
            {message}
          </p>
        )}
      </div>
    </Modal>
  )
}
