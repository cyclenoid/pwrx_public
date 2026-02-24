import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUserProfile, updateUserProfile, updateUserSetting } from '../lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import type { UserProfile } from '../types/user'

export default function Settings() {
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile'],
    queryFn: getUserProfile,
    staleTime: 5 * 60 * 1000,
  })

  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, string>>({})

  const profileMutation = useMutation({
    mutationFn: (updates: Partial<UserProfile>) => updateUserProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      setEditing({})
    },
  })

  const settingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateUserSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['ftp'] })
      setEditing({})
    },
  })

  const handleProfileUpdate = (field: string) => {
    profileMutation.mutate({ [field]: values[field] })
  }

  const handleSettingUpdate = (key: string) => {
    settingMutation.mutate({ key, value: values[key] })
  }

  const startEdit = (field: string, currentValue: string | null | undefined) => {
    setValues({ ...values, [field]: currentValue || '' })
    setEditing({ ...editing, [field]: true })
  }

  const cancelEdit = (field: string) => {
    setEditing({ ...editing, [field]: false })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading...</div>
  }

  if (!profile) {
    return <div className="flex items-center justify-center h-96">Profile not found</div>
  }

  const renderField = (
    label: string,
    field: string,
    currentValue: string | null | undefined,
    isProfileField: boolean,
    unit?: string
  ) => (
    <div className="flex items-center justify-between py-3 border-b">
      <div className="flex-1">
        <label className="text-sm font-medium">{label}</label>
        {!editing[field] ? (
          <p className="text-sm text-muted-foreground mt-1">
            {currentValue || '-'} {unit}
          </p>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={values[field] || ''}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
              className="px-3 py-1 border rounded bg-background text-sm"
              autoFocus
            />
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {!editing[field] ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => startEdit(field, currentValue)}
          >
            Bearbeiten
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => isProfileField ? handleProfileUpdate(field) : handleSettingUpdate(field)}
              disabled={profileMutation.isPending || settingMutation.isPending}
            >
              Speichern
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelEdit(field)}
            >
              Abbrechen
            </Button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Einstellungen</h2>
        <p className="text-muted-foreground">
          Verwalte dein Profil und Trainingseinstellungen
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Deine persönlichen Informationen</CardDescription>
        </CardHeader>
        <CardContent>
          {renderField('Vorname', 'firstname', profile.firstname, true)}
          {renderField('Nachname', 'lastname', profile.lastname, true)}
          {renderField('Benutzername', 'username', profile.username, true)}
          {renderField('Stadt', 'city', profile.city, true)}
          {renderField('Land', 'country', profile.country, true)}
        </CardContent>
      </Card>

      {/* Training Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Trainingseinstellungen</CardTitle>
          <CardDescription>Konfiguriere deine Trainingsdaten</CardDescription>
        </CardHeader>
        <CardContent>
          {renderField('Körpergewicht', 'athlete_weight', profile.settings?.athlete_weight, false, 'kg')}
          {renderField('FTP (Functional Threshold Power)', 'ftp', profile.settings?.ftp, false, 'W')}
          {renderField('Wochenziel Distanz', 'weekly_distance_goal', profile.settings?.weekly_distance_goal, false, 'km')}
          {renderField('Jahresziel Distanz', 'yearly_distance_goal', profile.settings?.yearly_distance_goal, false, 'km')}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiken</CardTitle>
          <CardDescription>Deine Aktivitäten auf einen Blick</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold">{profile.total_activities}</p>
              <p className="text-xs text-muted-foreground mt-1">Gesamt Aktivitäten</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold">{profile.total_distance_km?.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground mt-1">Gesamt km</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold">{profile.activities_this_year}</p>
              <p className="text-xs text-muted-foreground mt-1">Aktivitäten {new Date().getFullYear()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
