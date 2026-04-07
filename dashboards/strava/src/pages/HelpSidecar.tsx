import { Link } from 'react-router-dom'
import { BookOpen, FolderInput, Info, ServerCog, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useTranslation } from 'react-i18next'

export default function HelpSidecar() {
  const { t } = useTranslation()
  const steps = t('helpSidecar.steps.items', { returnObjects: true }) as string[]
  const installSteps = t('helpSidecar.install.items', { returnObjects: true }) as string[]
  const checkSteps = t('helpSidecar.check.items', { returnObjects: true }) as string[]
  const useCases = t('helpSidecar.useCases.items', { returnObjects: true }) as string[]
  const requirements = t('helpSidecar.requirements.items', { returnObjects: true }) as string[]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            {t('helpSidecar.badge')}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t('helpSidecar.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('helpSidecar.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
          >
            <FolderInput className="h-4 w-4" />
            {t('helpSidecar.openImport')}
          </Link>
        </div>
      </div>

      <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-card/95 to-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-orange-400" />
            {t('helpSidecar.keyPointTitle')}
          </CardTitle>
          <CardDescription>{t('helpSidecar.keyPointBody')}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('helpSidecar.whatItIs.title')}</CardTitle>
            <CardDescription>{t('helpSidecar.whatItIs.body')}</CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('helpSidecar.whatItIsNot.title')}</CardTitle>
            <CardDescription>{t('helpSidecar.whatItIsNot.body')}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ServerCog className="h-4 w-4 text-orange-400" />
              {t('helpSidecar.steps.title')}
            </CardTitle>
            <CardDescription>{t('helpSidecar.steps.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-xs font-semibold text-orange-300">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed text-foreground/90">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/60 bg-card/95 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('helpSidecar.useCases.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-foreground/90">
                {useCases.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/95 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('helpSidecar.requirements.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-foreground/90">
                {requirements.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('helpSidecar.install.title')}</CardTitle>
            <CardDescription>{t('helpSidecar.install.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {installSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-xs font-semibold text-orange-300">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed text-foreground/90">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
              {t('helpSidecar.check.title')}
            </CardTitle>
            <CardDescription>{t('helpSidecar.check.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {checkSteps.map((step) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span className="leading-relaxed text-foreground/90">{step}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
