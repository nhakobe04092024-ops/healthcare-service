import React from 'react';

export default function FilterPanel({
  categories,
  regions,
  activeCategories,
  activeRegions,
  onToggleCategory,
  onToggleRegion,
  searchQuery,
  onSearchChange,
  markerStyles,
  visibleCount,
  totalCount,
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Filters</h2>
        <span className="panel-count">
          {visibleCount}/{totalCount} visible
        </span>
      </header>

      <div className="panel-section">
        <label className="field-label" htmlFor="facility-search">
          Search by name or code
        </label>
        <div className="search-wrap">
          <input
            id="facility-search"
            className="search-input"
            type="search"
            placeholder="e.g. H01, FV, Hoan My"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="panel-section">
        <h3 className="field-label">Categories</h3>
        <ul className="filter-list">
          {categories.map((c) => {
            const style = markerStyles[c];
            const checked = activeCategories.has(c);
            return (
              <li key={c}>
                <label className={`filter-row${checked ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCategory(c)}
                  />
                  <span
                    className="swatch"
                    style={{ background: style?.color || '#999' }}
                    aria-hidden="true"
                  />
                  <span className="filter-text">{c}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel-section">
        <h3 className="field-label">Regions</h3>
        <ul className="filter-list">
          {regions.map((r) => {
            const checked = activeRegions.has(r);
            return (
              <li key={r}>
                <label className={`filter-row${checked ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleRegion(r)}
                  />
                  <span className="filter-text">{r}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
