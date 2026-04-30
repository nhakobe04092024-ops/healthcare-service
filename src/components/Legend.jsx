import React from 'react';

export default function Legend({ markerStyles }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Legend</h2>
      </header>
      <ul className="legend-list">
        {Object.entries(markerStyles).map(([key, style]) => (
          <li key={key}>
            <span
              className={`legend-swatch hm-${style.shape}`}
              style={{ '--c': style.color, '--t': style.text_color }}
              aria-hidden="true"
            />
            <span className="legend-text">{key}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
