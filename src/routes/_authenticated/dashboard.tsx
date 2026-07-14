import { createFileRoute, Outlet } from '@tanstack/react-router'
import { DashboardTabs } from '@/components/Dahsboard/DashboardTabs'

// Shared layout for /dashboard and /dashboard/posts — header + tab nav here,
// page-specific content in dashboard.index.tsx (Overview) and
// dashboard.posts.tsx (Post Control) via Outlet. Without this Outlet, a
// nested child route (dashboard.posts.tsx) never actually renders its own
// component — TanStack Router still treats it as a child of this route
// (routePath prefix match), so this file must be the one that places it.
export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <div className="w-full max-w-4xl mx-auto pb-24">
      <div className="flex flex-col gap-10">
        <header className="px-2 md:px-0">
          <h1 className="text-3xl font-black tracking-tight text-text mb-2">Dashboard</h1>
          <p className="text-text-s">
            Overview of your account activity and moderation actions.
          </p>
        </header>

        <DashboardTabs />

        <Outlet />
      </div>
    </div>
  )
}
