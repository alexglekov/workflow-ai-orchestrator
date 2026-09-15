import { connectorVisual } from '~/shared/lib/connector-visuals';

const Glyph = ({
  id,
  size,
  letter,
}: {
  id: string;
  size: number;
  letter: string;
}) => {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (id === 'telegram') {
    return (
      <svg {...props} fill="currentColor" stroke="none">
        <path d="M21.15 3.52 2.86 10.7c-.82.32-.81 1.47.12 1.7l4.72 1.18 1.83 5.7c.24.76 1.2.98 1.76.4l2.62-2.7 4.38 3.22c.7.52 1.7.12 1.9-.74L22.4 4.55c.22-.9-.7-1.6-1.25-1.03Zm-11.4 9.95 8.55-5.28-6.92 6.62-.18 2.52-1.45-3.86Z" />
      </svg>
    );
  }

  if (id === 'mail') {
    return (
      <svg {...props}>
        <rect x="3.5" y="6" width="17" height="12.5" rx="2.2" />
        <path d="m5 8 7 5.2L19 8" />
      </svg>
    );
  }

  if (id === 'excel') {
    return (
      <svg {...props}>
        <rect x="4" y="4.5" width="16" height="15" rx="2.2" />
        <path d="M4 9.5h16M4 14.5h16M10 4.5v15" />
      </svg>
    );
  }

  if (id === 'onec') {
    return (
      <svg {...props}>
        <ellipse cx="12" cy="7" rx="7" ry="2.6" />
        <path d="M5 7v5.5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V7" />
        <path d="M5 12.5V18c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5.5" />
      </svg>
    );
  }

  if (id === 'web') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8" />
        <path d="M4.2 12h15.6M12 4.2c2.4 2.4 3.6 5 3.6 7.8S14.4 17.4 12 19.8C9.6 17.4 8.4 14.8 8.4 12S9.6 6.6 12 4.2Z" />
      </svg>
    );
  }

  if (id === 'browser') {
    return (
      <svg {...props}>
        <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
        <path d="M3.5 9.2h17" />
        <circle cx="7" cy="7.1" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="9.4" cy="7.1" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (id === 'llm') {
    return (
      <svg {...props}>
        <path d="M12 3 9.9 9.9 3 12l6.9 2.1L12 21l2.1-6.9L21 12l-6.9-2.1z" />
      </svg>
    );
  }

  if (id === 'transform') {
    return (
      <svg {...props}>
        <path d="M4 6h16l-6.2 7.2v4.3L10.2 20v-6.8Z" />
      </svg>
    );
  }

  if (id === 'memory') {
    return (
      <svg {...props}>
        <path d="M12 4 4.5 7.6 12 11.2l7.5-3.6L12 4Z" />
        <path d="M4.5 12 12 15.6 19.5 12" />
        <path d="M4.5 16.4 12 20l7.5-3.6" />
      </svg>
    );
  }

  return <span>{letter}</span>;
};

export const ConnectorMark = ({
  id,
  size = 44,
  glyph,
  className = 'node-icon',
}: {
  id: string;
  size?: number;
  glyph?: number;
  className?: string;
}) => {
  const visual = connectorVisual(id);

  return (
    <span
      className={className}
      style={{
        background: visual.bg,
        color: visual.color,
        ...(size === 44 ? {} : { width: size, height: size }),
      }}
    >
      <Glyph id={id} size={glyph ?? Math.round(size * 0.5)} letter={visual.letter} />
    </span>
  );
};
