import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle2, FolderInput, Info, SlidersHorizontal, Terminal } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useTranslation } from 'react-i18next'

type CommandBlock = {
  label: string
  code: string
}

type QuickStartStep = {
  title: string
  body: string
  bullets?: string[]
  commands?: CommandBlock[]
}

export default function HelpSidecar() {
  const { t } = useTranslation()
  const quickFacts = t('helpSidecar.quickFacts.items', { returnObjects: true }) as string[]
  const requirements = t('helpSidecar.requirements.items', { returnObjects: true }) as string[]
  const quickStart = t('helpSidecar.quickStart.steps', { returnObjects: true }) as QuickStartStep[]
  const controlItems = t('helpSidecar.control.items', { returnObjects: true }) as string[]
  const checkItems = t('helpSidecar.check.items', { returnObjects: true }) as string[]

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
        <Link
          to="/import"
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
        >
          <FolderInput className="h-4 w-4" />
          {t('helpSidecar.openImport')}
        </Link>
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
            <CardTitle className="text-base">{t('helpSidecar.quickFacts.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-foreground/90">
              {quickFacts.map((item) => (
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

      <Card className="border-border/60 bg-card/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-orange-400" />
            {t('helpSidecar.quickStart.title')}
          </CardTitle>
          <CardDescription>{t('helpSidecar.quickStart.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {quickStart.map((step, index) => (
              <div
                key={step.title}
                className="rounded-xl border border-border/60 bg-background/40 p-4"
              >
                <div className="mb-3 flex items-start gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-xs font-semibold text-orange-300">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </div>

                {step.bullets && step.bullets.length > 0 ? (
                  <ul className="mb-3 space-y-1.5 text-sm text-foreground/90">
                    {step.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {step.commands && step.commands.length > 0 ? (
                  <div className="space-y-3">
                    {step.commands.map((command) => (
                      <div key={`${step.title}-${command.label}`}>
                        <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          {command.label}
                        </div>
                        <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                          <code>{command.code}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-orange-400" />
              {t('helpSidecar.control.title')}
            </CardTitle>
            <CardDescription>{t('helpSidecar.control.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm text-foreground/90">
              {controlItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t('helpSidecar.control.exampleLabel')}
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                <code>{t('helpSidecar.control.exampleCode')}</code>
              </pre>
            </div>
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
            <ul className="space-y-2 text-sm text-foreground/90">
              {checkItems.map((item) => (
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
  )
}
