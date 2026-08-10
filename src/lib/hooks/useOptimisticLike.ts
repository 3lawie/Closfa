import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ServerResult } from '@/server/lib/result'

interface LikeResult {
  liked: boolean
  likes: number
}

export interface OptimisticLike {
  liked: boolean
  likes: number
  toggle: () => void
  isPending: boolean
}

/**
 * The like/unlike optimistic-update dance, which existed in three byte-identical
 * copies (post, comment, reply) differing only in which server function they
 * called.
 *
 * Flips local state immediately, rolls back to the pre-click snapshot if the
 * request fails, then reconciles with whatever the server says — so a stale
 * count from a concurrent liker self-corrects rather than drifting.
 */
export function useOptimisticLike(
  mutationFn: () => Promise<ServerResult<LikeResult>>,
  initialLikes: number,
  initialLiked = false,
): OptimisticLike {
  const [liked, setLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(initialLikes)

  const mutation = useMutation({
    mutationFn,
    onMutate: () => {
      const snapshot = { liked, likes }
      setLiked((v) => !v)
      setLikes((n) => (liked ? Math.max(0, n - 1) : n + 1))
      return snapshot
    },
    onError: (_err, _vars, snapshot) => {
      if (snapshot) {
        setLiked(snapshot.liked)
        setLikes(snapshot.likes)
      }
    },
    onSuccess: (res) => {
      if (res.ok) {
        setLiked(res.data.liked)
        setLikes(res.data.likes)
      }
    },
  })

  return {
    liked,
    likes,
    toggle: () => mutation.mutate(),
    isPending: mutation.isPending,
  }
}
