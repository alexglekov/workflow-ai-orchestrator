export const connectorVisual = (id: string) => {
  const map: Record<string, { letter: string; bg: string; color: string }> = {
    mail: { letter: 'M', bg: '#fde8e8', color: '#c62828' },
    telegram: { letter: 'Tg', bg: '#e3f2fd', color: '#1565c0' },
    onec: { letter: '1C', bg: '#fff3e0', color: '#ef6c00' },
    excel: { letter: 'Xl', bg: '#e8f5e9', color: '#2e7d32' },
  };

  return map[id] ?? { letter: id.slice(0, 2).toUpperCase(), bg: '#f4f4f5', color: '#3f3f46' };
};
