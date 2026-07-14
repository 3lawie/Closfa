import { Link } from '@tanstack/react-router'

const TABS = [
  { to: '/dashboard' as const, label: 'Overview' },
  { to: '/dashboard/posts' as const, label: 'Post Control' },
]

/** Shared two-tab nav between the dashboard's stats/reports/roles page and its separate post-management page. */
export function DashboardTabs() {
  return (
    <nav className="flex items-center gap-1 px-2 md:px-0 -mb-2">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeOptions={{ exact: true }}
          className="px-4 py-2 rounded-[var(--r-pill)] text-sm font-semibold text-text-s hover:text-text transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          activeProps={{ className: 'bg-accent-bg text-accent hover:text-accent' }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
