export const connectorVisual = (id: string) => {
  const map: Record<string, { letter: string; bg: string; color: string }> = {
    mail: { letter: 'M', bg: '#fde8e8', color: '#c62828' },
    telegram: { letter: 'Tg', bg: '#e3f2fd', color: '#1565c0' },
    onec: { letter: '1C', bg: '#fff3e0', color: '#ef6c00' },
    excel: { letter: 'Xl', bg: '#e8f5e9', color: '#2e7d32' },
    web: { letter: 'W', bg: '#ede7f6', color: '#5e35b1' },
    llm: { letter: 'AI', bg: '#e0f2f1', color: '#00695c' },
    transform: { letter: 'Tx', bg: '#fff8e1', color: '#f9a825' },
    memory: { letter: 'Me', bg: '#f3e5f5', color: '#7b1fa2' },
    social: { letter: 'So', bg: '#e8eaf6', color: '#3949ab' },
    browser: { letter: 'Br', bg: '#eceff1', color: '#455a64' },
  };

  return map[id] ?? { letter: id.slice(0, 2).toUpperCase(), bg: '#f4f4f5', color: '#3f3f46' };
};

export const connectorNeedsAccount = (id: string) =>
  !['web', 'llm', 'transform', 'memory', 'browser'].includes(id);
