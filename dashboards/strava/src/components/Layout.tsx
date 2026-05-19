import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import { ThemeToggle } from './ThemeToggle'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Bike,
  ChevronDown,
  Coffee,
  Database,
  Dumbbell,
  FileUp,
  Flag,
  LayoutDashboard,
  Map,
  Settings,
  Trophy,
  Users as UsersIcon,
  Zap,
} from 'lucide-react'
import { useCapabilities } from '../hooks/useCapabilities'

export function Layout() {
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { capabilities } = useCapabilities()

  const toggleLanguage = () => {
    const next = i18n.language?.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(next)
  }

  const standaloneNavItems = [
    {
      path: '/',
      label: t('nav.dashboard'),
      icon: <LayoutDashboard size={16} />,
    },
  ]

  const navGroups = [
    {
      label: t('nav.groups.analysis'),
      icon: <Zap size={16} />,
      items: [
        {
          path: '/records',
          label: t('nav.records'),
          icon: <Trophy size={16} />,
        },
        {
          path: '/training',
          label: t('nav.training'),
          icon: <Activity size={16} />,
        },
        {
          path: '/power',
          label: t('nav.power'),
          icon: <Zap size={16} />,
        },
        {
          path: '/heatmap',
          label: t('nav.heatmap'),
          icon: <Map size={16} />,
        },
        {
          path: '/segments',
          label: t('nav.segments'),
          icon: <Flag size={16} />,
          enabled: capabilities.supportsSegments,
        },
        {
          path: '/gear',
          label: t('nav.gear'),
          icon: <Bike size={16} />,
        },
      ],
    },
    {
      label: t('nav.groups.training'),
      icon: <Dumbbell size={16} />,
      items: [
        {
          path: '/exercises',
          label: t('nav.exercises'),
          icon: <Dumbbell size={16} />,
        },
        {
          path: '/club',
          label: t('nav.club'),
          icon: <UsersIcon size={16} />,
          enabled: capabilities.supportsClubs,
        },
      ],
    },
    {
      label: t('nav.groups.data'),
      icon: <Database size={16} />,
      items: [
        {
          path: '/activities',
          label: t('nav.activities'),
          icon: <Activity size={16} />,
        },
        {
          path: '/import',
          label: t('nav.import'),
          icon: <FileUp size={16} />,
        },
      ],
    },
  ].map((group) => ({
    ...group,
    items: group.items.filter((item) => item.enabled !== false),
  })).filter((group) => group.items.length > 0)

  const isPathActive = (path: string) => path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(path)

  const navLinkClass = (isActive: boolean) => cn(
    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
    isActive
      ? "bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg"
      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex min-h-16 items-center justify-between gap-4 py-2">
            {/* Logo */}
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img
                src="/logo.png"
                alt="PWRX"
                style={{ height: '60px' }}
              />
            </Link>

            {/* Navigation */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 whitespace-nowrap pr-2">
                {standaloneNavItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={navLinkClass(isPathActive(item.path))}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}

                {navGroups.map((group) => {
                  const isActive = group.items.some((item) => isPathActive(item.path))
                  return (
                    <div key={group.label} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                          isActive
                            ? "bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                      >
                        {group.icon}
                        {group.label}
                        <ChevronDown size={14} />
                      </button>
                      <div className="invisible absolute right-0 top-full z-50 min-w-52 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                        <div className="overflow-hidden rounded-lg border border-border bg-[hsl(var(--popover))] p-1 shadow-2xl ring-1 ring-black/10 dark:ring-white/10">
                          {group.items.map((item) => (
                            <Link
                              key={item.path}
                              to={item.path}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isPathActive(item.path)
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              )}
                            >
                              {item.icon}
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </nav>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Divider */}
                <div className="ml-1 mr-1 h-6 border-l border-border/80" />

                {/* Theme Toggle */}
                <ThemeToggle />

                {/* Settings Link */}
                <Link
                  to="/settings"
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-all",
                    location.pathname.startsWith('/settings')
                      ? "bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                  title={t('nav.settings')}
                >
                  <Settings size={20} />
                </Link>

                {/* Language Toggle */}
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="inline-flex h-9 min-w-10 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  title={t('language.label')}
                >
                  {i18n.language?.startsWith('de') ? t('language.de') : t('language.en')}
                </button>

              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p className="mb-1">{t('footer.poweredBy')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <span>{t('footer.poweredByLine')}</span>
            <a href="https://cyclenoid.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              cyclenoid.com
            </a>
            <span className="text-muted-foreground/50">|</span>
            <a
              href="https://buymeacoffee.com/cyclenoid"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Coffee size={14} />
              <span>{t('footer.supportLink')}</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
