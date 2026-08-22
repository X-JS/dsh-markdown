/** 统一风格的线性 SVG 图标（1.6px 描边，current色，替代大小不一的 emoji） */
type P = { size?: number; className?: string };

const base = (d: React.ReactNode, { size = 16, className }: P, extra?: React.SVGProps<SVGSVGElement>) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
    {...extra}
  >
    {d}
  </svg>
);

export const IconClock = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>, p);
export const IconPlus = (p: P) => base(<path d="M12 5v14M5 12h14" />, p);
export const IconSend = (p: P) => base(<path d="M4.5 12 20 4l-4 16-4.5-5.5L4.5 12Z" />, p);
export const IconImage = (p: P) => base(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4.5 4" /></>, p);
export const IconCamera = (p: P) => base(<><path d="M4 8.5A2 2 0 0 1 6 6.5h1.6l1.2-1.8h6.4l1.2 1.8H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" /><circle cx="12" cy="12.5" r="3.4" /></>, p);
export const IconGlobe = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9Z" /></>, p);
export const IconNote = (p: P) => base(<><path d="M6 3.5h9L19.5 8v12.5H6V3.5Z" /><path d="M14.5 3.5V8h5" /><path d="M9 12.5h7M9 16h5" /></>, p);
export const IconTrash = (p: P) => base(<><path d="M4.5 6.5h15M9.5 6V4.5h5V6M7 6.5l.8 13h8.4l.8-13" /><path d="M10.5 10v6M13.5 10v6" /></>, p);
export const IconClose = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p);
