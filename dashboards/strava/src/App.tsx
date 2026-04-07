import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/ThemeProvider'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Activities } from './pages/Activities'
import { ActivityDetail } from './pages/ActivityDetail'
import { SegmentDetail } from './pages/SegmentDetail'
import { SegmentsDashboard } from './pages/SegmentsDashboard'
import { Records } from './pages/Records'
import { Heatmap } from './pages/Heatmap'
import { Training } from './pages/Training'
import { PowerProfile } from './pages/PowerProfile'
import { Gear } from './pages/Gear'
import { Club } from './pages/Club'
import { FeatureLog } from './pages/FeatureLog'
import HelpSidecar from './pages/HelpSidecar'
import ImportPage from './pages/Import'
import Settings from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Heatmap is fullscreen - outside Layout */}
            <Route path="heatmap" element={<Heatmap />} />

            {/* All other pages use Layout */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="activities" element={<Activities />} />
              <Route path="activity/:id" element={<ActivityDetail />} />
              <Route path="segment/:id" element={<SegmentDetail />} />
              <Route path="segments" element={<SegmentsDashboard />} />
              <Route path="climbs" element={<Navigate to="/segments" replace />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="records" element={<Records />} />
              <Route path="training" element={<Training />} />
              <Route path="power" element={<PowerProfile />} />
              <Route path="gear" element={<Gear />} />
              <Route path="club" element={<Club />} />
              <Route path="feature-log" element={<FeatureLog />} />
              <Route path="help/sidecar" element={<HelpSidecar />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
