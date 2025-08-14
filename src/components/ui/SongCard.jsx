import React from 'react';
import '../../styles/cards.css';

export default function SongCard({
  title,
  subtitle,
  tags = [],
  leftSlot = null,
  rightSlot = null,
  onClick,
}) {
  const interactive = onClick ? { onClick, role: 'button', tabIndex: 0 } : {};
  return (
    <div className="gc-card" {...interactive}>
      {leftSlot}
      <div style={{ minWidth: 0 }}>
        <div className="gc-card__title">{title}</div>
        {subtitle && <div className="gc-card__meta">{subtitle}</div>}
        {tags.length > 0 && (
          <div className="gc-card__meta" style={{ marginTop: 6 }}>
            {tags.map((t) => (
              <span key={t} className="gc-card__tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="gc-card__spacer" />
      {rightSlot}
    </div>
  );
}

