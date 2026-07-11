import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/notifications')({
  beforeLoad: () => {
    throw redirect({ href: '/', search: { notifications: true } })
  },
  component: () => null,
})
