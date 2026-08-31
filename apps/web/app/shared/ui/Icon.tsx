type IconName =
  | 'home'
  | 'plus'
  | 'play'
  | 'save'
  | 'send'
  | 'search'
  | 'close'
  | 'chevron'
  | 'target'
  | 'blocks'
  | 'spark'
  | 'trash';

export const Icon = ({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {name === 'home' ? (
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    ) : null}
    {name === 'plus' ? (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ) : null}
    {name === 'play' ? <path d="M8 6.5v11L19 12z" fill="currentColor" stroke="none" /> : null}
    {name === 'save' ? (
      <>
        <path d="M5 5h11l3 3v11H5z" />
        <path d="M8 5v4h8" />
        <path d="M8 19v-6h8v6" />
      </>
    ) : null}
    {name === 'send' ? <path d="M12 19V6M6 12l6-6 6 6" /> : null}
    {name === 'search' ? (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ) : null}
    {name === 'close' ? (
      <>
        <path d="M7 7l10 10" />
        <path d="M17 7 7 17" />
      </>
    ) : null}
    {name === 'chevron' ? <path d="m9 6 6 6-6 6" /> : null}
    {name === 'target' ? (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </>
    ) : null}
    {name === 'blocks' ? (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.4" />
        <rect x="13" y="4" width="7" height="7" rx="1.4" />
        <rect x="4" y="13" width="7" height="7" rx="1.4" />
        <rect x="13" y="13" width="7" height="7" rx="1.4" />
      </>
    ) : null}
    {name === 'spark' ? (
      <path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2z" />
    ) : null}
    {name === 'trash' ? (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7" />
        <path d="M6.5 7l.8 12.2A1.8 1.8 0 0 0 9.1 21h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </>
    ) : null}
  </svg>
);
