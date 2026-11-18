/** The app symbol: an invoice sheet with a dog-ear on a green tile. Placeholder until the openrootz logo exists. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
      <rect width="36" height="36" rx="10" fill="#2E6B4E" />
      <path d="M10.5 7h11L27 12.5V29H10.5z" fill="#F4F2EA" />
      <path d="M21.5 7v5.5H27z" fill="#A9CDB8" />
      <g fill="none" stroke="#2E6B4E" strokeLinecap="round">
        <path d="M14 17h8M14 20.5h9" strokeWidth="1.8" />
        <path d="M14 25h5" strokeWidth="2.8" />
      </g>
    </svg>
  );
}
