import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/moderator')({
  beforeLoad: () => {
    throw redirect({ href: '/dashboard' })
  },
  component: () => null,
})
