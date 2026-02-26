import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import { ThemeToggle } from './ThemeToggle'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Trophy, Map, Activity, Zap, Bike, Settings, Flag, FileUp } from 'lucide-react'
import { useCapabilities } from '../hooks/useCapabilities'

export function Layout() {
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { capabilities } = useCapabilities()

  const toggleLanguage = () => {
    const next = i18n.language?.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(next)
  }

  const navItems = [
    {
      path: '/',
      label: t('nav.dashboard'),
      icon: <LayoutDashboard size={16} />,
    },
    {
      path: '/records',
      label: t('nav.records'),
      icon: <Trophy size={16} />,
    },
    {
      path: '/heatmap',
      label: t('nav.heatmap'),
      icon: <Map size={16} />,
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
  ].filter((item) => item.enabled !== false)

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
              <nav className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto whitespace-nowrap pr-2">
                {navItems.map((item) => {
                  const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path)

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        isActive
                          ? "bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  )
                })}
              </nav>

              <div className="flex items-center gap-2 shrink-0">
                {/* Divider */}
                <div className="ml-2 pl-2 border-l h-6" />

                {/* Theme Toggle */}
                <ThemeToggle />

                {/* Import Link */}
                <Link
                  to="/import"
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    location.pathname.startsWith('/import')
                      ? "bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                  title={t('nav.import')}
                >
                  <FileUp size={20} />
                </Link>

                {/* Settings Link */}
                <Link
                  to="/settings"
                  className={cn(
                    "p-2 rounded-lg transition-all",
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
                  className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
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
            <a href="https://buymeacoffee.com/cyclenoid" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              buymeacoffee.com/cyclenoid
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
