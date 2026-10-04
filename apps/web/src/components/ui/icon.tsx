import type { SVGProps } from 'react';

// Small, local, decorative SVG vocabulary. Accessible names belong to the control.
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name:
    | 'search'
    | 'close'
    | 'check'
    | 'info'
    | 'warning'
    | 'arrow'
    | 'menu'
    | 'heart'
    | 'message'
    | 'bell'
    | 'user'
    | 'car'
    | 'part'
    | 'plus'
    | 'location';
}) {
  const paths = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    message: (
      <path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-5a9 9 0 1 1 16.6-4.5ZM8 9h8M8 13h5" />
    ),
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    car: (
      <>
        <path d="m4 10 2-6h12l2 6M3 10h18v8H3ZM5 18v3m14-3v3M7 14h1m8 0h1" />
      </>
    ),
    part: (
      <>
        <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    location: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2L12 3ZM12 9v5M12 17v1" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
