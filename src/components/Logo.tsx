/** A sticker with a dashed blade line, sitting on a mat. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#a7cdb1" />
      <path
        d="M10 8.5h8.2c1.2 0 1.9.5 2.7 1.3l2.2 2.2c.8.8 1.4 1.5 1.4 2.7V22a2.5 2.5 0 0 1-2.5 2.5H10A2.5 2.5 0 0 1 7.5 22V11A2.5 2.5 0 0 1 10 8.5Z"
        fill="#fbfbf6"
        stroke="#c7211f"
        strokeWidth="1.6"
        strokeDasharray="3.2 2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
