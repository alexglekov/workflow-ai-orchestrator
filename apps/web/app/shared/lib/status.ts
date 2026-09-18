export const connectionStatusLabel = (status: string) => {
  if (status === 'connected') {
    return 'подключено';
  }

  if (status === 'error') {
    return 'ошибка';
  }

  return 'не подключено';
};

export const runStatusLabel = (status: string, cancelRequested = false) => {
  if (cancelRequested && (status === 'running' || status === 'pending')) {
    return 'остановка';
  }

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

  return 'в очереди';
};

export const isActiveRun = (run: {
  status: string;
  cancelRequested?: boolean;
}) =>
  !run.cancelRequested &&
  (run.status === 'pending' || run.status === 'running');

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
