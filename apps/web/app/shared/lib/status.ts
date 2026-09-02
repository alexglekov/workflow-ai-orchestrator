export const connectionStatusLabel = (status: string) => {
  if (status === 'connected') {
    return 'подключено';
  }

  if (status === 'error') {
    return 'ошибка';
  }

  return 'не подключено';
};

export const runStatusLabel = (status: string) => {
  if (status === 'running') {
    return 'выполняется';
  }

  if (status === 'success') {
    return 'успешно';
  }

  if (status === 'error') {
    return 'ошибка';
  }

  if (status === 'cancelled') {
    return 'отменён';
  }

  return 'ожидает';
};

export const stepStatusLabel = (status: string) => {
  if (status === 'running') {
    return 'выполняется';
  }

  if (status === 'success') {
    return 'успех';
  }

  if (status === 'error') {
    return 'ошибка';
  }

  if (status === 'cancelled') {
    return 'отменён';
  }

  return 'ожидает';
};
