import React from 'react';

function Row({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </>
  );
}

export default function FacilityDetail({ facility, markerStyle, onClose }) {
  const accent = markerStyle?.color || '#0B2E5C';

  return (
    <aside className="detail-panel" role="dialog" aria-label={`Details for ${facility.name}`}>
      <header className="detail-head" style={{ borderTopColor: accent }}>
        <div className="detail-head-text">
          <span className="detail-code" style={{ background: accent }}>
            {facility.code}
          </span>
          <h2>{facility.name}</h2>
          <p className="detail-sub">{facility.area}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>

      <div className="detail-scroll">
        <dl className="detail-grid">
          <Row label="Code" value={facility.code} />
          <Row label="Facility" value={facility.name} />
          <Row label="Area" value={facility.area} />
          <Row label="Region" value={facility.region} />
          <Row label="Map layer" value={facility.map_layer} />
          <Row label="Category" value={facility.category} />
          <Row label="Address hint" value={facility.address_hint} />
          <Row label="Coordinate confidence" value={facility.coordinate_confidence} />
          <Row label="Ownership" value={facility.ownership_group} />
        </dl>

        {facility.specialty_tags?.length > 0 && (
          <div className="detail-tags">
            <h3 className="field-label">Specialty tags</h3>
            <div className="tag-row">
              {facility.specialty_tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {facility.note && (
          <div className="detail-note">
            <h3 className="field-label">Note</h3>
            <p>{facility.note}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
