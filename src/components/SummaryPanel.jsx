import React from 'react';

const LABELS = {
  total_facilities: 'Total facilities',
  hospital_facilities: 'Hospitals',
  strategic_clinic_assets: 'Strategic clinics',
  hoan_my_hanh_phuc_thuan_my_hospital_assets: 'Hoan My / Hanh Phuc / Thuan My',
  tam_tri_assets: 'Tam Tri',
  phuong_chau_phuong_nam_assets: 'Phuong Chau / Phuong Nam',
  private_multi_specialty_competitors: 'Multi-specialty competitors',
  private_specialty_competitors: 'Specialty competitors',
};

const HIGHLIGHT_KEYS = new Set(['total_facilities', 'hospital_facilities', 'strategic_clinic_assets']);

export default function SummaryPanel({ summary }) {
  const entries = Object.entries(summary);
  const highlights = entries.filter(([k]) => HIGHLIGHT_KEYS.has(k));
  const rest = entries.filter(([k]) => !HIGHLIGHT_KEYS.has(k));

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Summary</h2>
      </header>

      <div className="panel-section summary-highlights">
        {highlights.map(([k, v]) => (
          <div key={k} className="highlight-tile">
            <span className="highlight-value">{v}</span>
            <span className="highlight-label">{LABELS[k] || k}</span>
          </div>
        ))}
      </div>

      <ul className="summary-list">
        {rest.map(([k, v]) => (
          <li key={k}>
            <span className="summary-label">{LABELS[k] || k}</span>
            <span className="summary-value">{v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
