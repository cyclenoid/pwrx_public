import { TileLayer } from 'react-leaflet'

// Share the key-free provider and attribution across previews and full maps.
export function MapTileLayer() {
  return (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      className="pwrx-map-tiles"
      maxNativeZoom={19}
      maxZoom={20}
    />
  )
}
