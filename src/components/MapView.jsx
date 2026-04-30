import React, { forwardRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

function buildIcon(code, style, isSelected) {
  const { shape, color, text_color: textColor } = style;
  const selectedClass = isSelected ? ' hm-selected' : '';
  const html = `
    <div class="hm-marker hm-${shape}${selectedClass}" style="--c:${color};--t:${textColor}">
      <span class="hm-code">${code}</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'hm-marker-wrap',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

const MapView = forwardRef(function MapView(
  { center, facilities, markerStyles, onSelect, selectedCode },
  ref
) {
  const [tilesLoaded, setTilesLoaded] = useState(false);

  const markers = useMemo(
    () =>
      facilities.map((f) => {
        const style = markerStyles[f.map_layer];
        if (!style) return null;
        const icon = buildIcon(f.code, style, selectedCode === f.code);
        return (
          <Marker
            key={f.code}
            position={[f.lat, f.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(f) }}
          >
            <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
              <strong>{f.code}</strong> · {f.name}
            </Tooltip>
          </Marker>
        );
      }),
    [facilities, markerStyles, onSelect, selectedCode]
  );

  return (
    <div className="map-wrapper">
      {!tilesLoaded && (
        <div className="map-loading" aria-hidden="true">
          <div className="map-loading-spinner" />
          <span>Loading map…</span>
        </div>
      )}
      <MapContainer
        ref={ref}
        center={[center.lat, center.lng]}
        zoom={center.zoom}
        scrollWheelZoom
        zoomControl
        style={{ height: '100%', width: '100%' }}
        preferCanvas={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={19}
          keepBuffer={4}
          updateWhenIdle={false}
          updateWhenZooming={false}
          crossOrigin
          eventHandlers={{ load: () => setTilesLoaded(true) }}
        />
        {markers}
      </MapContainer>
    </div>
  );
});

export default MapView;
