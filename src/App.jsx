import React, { useCallback, useMemo, useRef, useState } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import data from './data/hcmc_healthcare_facilities_interactive_map.json';
import MapView from './components/MapView.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import FacilityDetail from './components/FacilityDetail.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import Legend from './components/Legend.jsx';

const CATEGORIES = [
  'Hoan My asset',
  'Tam Tri asset',
  'Phuong Chau asset',
  'Private multi-specialty competitor',
  'Private specialty competitor',
];

const REGIONS = ['Old HCMC', 'Former Binh Duong', 'Former Ba Ria - Vung Tau'];

export default function App() {
  const [activeCategories, setActiveCategories] = useState(() => new Set(CATEGORIES));
  const [activeRegions, setActiveRegions] = useState(() => new Set(REGIONS));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mapRef = useRef(null);

  const filteredFacilities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.facilities.filter((f) => {
      if (!activeCategories.has(f.map_layer)) return false;
      if (!activeRegions.has(f.region)) return false;
      if (q) {
        const hay = `${f.name} ${f.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeCategories, activeRegions, searchQuery]);

  const toggleCategory = useCallback((c) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const toggleRegion = useCallback((r) => {
    setActiveRegions((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }, []);

  const flyToFacility = useCallback((facility, zoom = 16) => {
    if (!facility || !mapRef.current) return;
    mapRef.current.flyTo([facility.lat, facility.lng], zoom, { duration: 1.1 });
    setSelectedFacility(facility);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <h1>HCMC Private Healthcare Landscape</h1>
            <p>{data.project_name} · {data.version}</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="ghost-btn mobile-only"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle filters"
          >
            {sidebarOpen ? 'Close' : 'Filters'}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`}>
          <SimpleBar className="sidebar-scroll" autoHide={false} forceVisible="y">
            <div className="sidebar-content">
              <FilterPanel
                categories={CATEGORIES}
                regions={REGIONS}
                activeCategories={activeCategories}
                activeRegions={activeRegions}
                onToggleCategory={toggleCategory}
                onToggleRegion={toggleRegion}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                markerStyles={data.marker_styles}
                visibleCount={filteredFacilities.length}
                totalCount={data.facilities.length}
              />
              <SummaryPanel summary={data.summary} />
              <Legend markerStyles={data.marker_styles} />
            </div>
          </SimpleBar>
        </aside>

        <main className="map-container">
          <MapView
            ref={mapRef}
            center={data.center}
            facilities={filteredFacilities}
            markerStyles={data.marker_styles}
            onSelect={flyToFacility}
            selectedCode={selectedFacility?.code}
          />
          {selectedFacility && (
            <FacilityDetail
              facility={selectedFacility}
              markerStyle={data.marker_styles[selectedFacility.map_layer]}
              onClose={() => setSelectedFacility(null)}
            />
          )}
        </main>
      </div>

      <footer className="app-footer">
        Draft strategic map for discussion only — coordinates require final verification.
      </footer>
    </div>
  );
}
