/** The hold-short marking: two solid bars, two dashed. Decorative; the wordmark carries the name. */
export function HoldlineMark() {
  return (
    <svg viewBox="0 0 32 24" aria-hidden="true" focusable="false">
      <rect x="0" y="1" width="32" height="3" fill="currentColor" />
      <rect x="0" y="7" width="32" height="3" fill="currentColor" />
      {[0, 11, 22].map((x) => (
        <g key={x}>
          <rect x={x} y="14" width="7" height="3" fill="currentColor" />
          <rect x={x} y="20" width="7" height="3" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
