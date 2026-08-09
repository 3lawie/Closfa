// ──────────────────────────────────────────────────────────────
// LoginPromptModal — shown when a guest tries an auth-gated action
// (like, save, comment, report, etc.)
// ──────────────────────────────────────────────────────────────

import { Modal } from '@/components/ui/Modal'
import { motion } from 'framer-motion'
import { Heart, Bookmark, MessageCircle, Flag, LogIn } from 'lucide-react'

type LoginAction = 'like' | 'save' | 'comment' | 'report' | 'generic'

interface LoginPromptModalProps {
  isOpen: boolean
  onClose: () => void
  action?: LoginAction
}

const actionConfig: Record<LoginAction, { icon: React.ElementType; title: string; description: string }> = {
  like: {
    icon: Heart,
    title: 'Like this post?',
    description: 'Log in to like posts and show appreciation to creators.',
  },
  save: {
    icon: Bookmark,
    title: 'Save for later?',
    description: 'Log in to bookmark posts and build your personal collection.',
  },
  comment: {
    icon: MessageCircle,
    title: 'Join the conversation',
    description: 'Log in to comment, reply, and connect with the community.',
  },
  report: {
    icon: Flag,
    title: 'Report content?',
    description: 'Log in to report posts that violate community guidelines.',
  },
  generic: {
    icon: LogIn,
    title: 'Log in to continue',
    description: 'Sign in to unlock all features and interact with the community.',
  },
}

export function LoginPromptModal({ isOpen, onClose, action = 'generic' }: LoginPromptModalProps) {
  const config = actionConfig[action]
  const Icon = config.icon

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="!max-w-sm">
      <div className="flex flex-col items-center text-center gap-5 py-2">
        {/* Animated icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0.3, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-accent-bg flex items-center justify-center"
        >
          <Icon className="w-7 h-7 text-accent" strokeWidth={2} />
        </motion.div>

        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="flex flex-col gap-2"
        >
          <h3 className="text-xl font-bold text-text-h">{config.title}</h3>
          <p className="text-sm text-text-s leading-relaxed max-w-[260px] mx-auto">
            {config.description}
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="w-full flex flex-col gap-3 pt-1"
        >
          <a
            href="/api/auth/login"
            className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-md font-semibold text-[15px] bg-accent text-white shadow-sm hover:bg-accent-hover active:scale-[0.97] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          >
            <LogIn className="w-4 h-4" />
            Log in to Closfa
          </a>
          <button
            onClick={onClose}
            className="text-sm text-text-s hover:text-text font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          >
            Maybe later
          </button>
        </motion.div>
      </div>
    </Modal>
  )
}
