import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Route } from 'lucide-react'
import { libraryText } from './library'
export function ActivityRouteLink({ activityId }: { activityId: number }) {
  const { i18n } = useTranslation()
  return <Link to={`/routes?activity=${activityId}`} className="my-2 inline-flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-600 hover:bg-orange-500/20 dark:text-orange-400">
    <Route size={16} />{libraryText[i18n.language.startsWith('de') ? 'de' : 'en'].fromActivity}
  </Link>
}
