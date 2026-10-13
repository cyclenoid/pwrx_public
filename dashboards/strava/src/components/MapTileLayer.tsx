import { TileLayer } from 'react-leaflet'
import { useTheme } from './ThemeProvider'

const cartoApiKey = String(import.meta.env.VITE_CARTO_BASEMAP_API_KEY || '').trim()
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function MapTileLayer() {
  const { resolvedTheme } = useTheme()
  const useCarto = cartoApiKey.length > 0
  const style = resolvedTheme === 'dark' ? 'dark_all' : 'light_all'
  const url = useCarto
    ? `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

  return (
    <TileLayer
      key={useCarto ? style : 'osm'}
      url={url}
      attribution={useCarto
        ? `${osmAttribution} &copy; <a href="https://carto.com/attributions">CARTO</a>`
        : osmAttribution}
      className={useCarto ? 'pwrx-carto-map-tiles' : 'pwrx-map-tiles'}
      maxNativeZoom={useCarto ? 20 : 19}
      maxZoom={20}
    />
  )
}
