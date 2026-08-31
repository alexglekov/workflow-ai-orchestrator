import type { RunWorkflowOptions, StepStatus } from './types';

export const runWorkflow = async (
  options: RunWorkflowOptions,
): Promise<'success' | 'error'> => {
  const ordered = [...options.steps].sort((a, b) => a.order - b.order);
  let previous: unknown = options.initialInput ?? null;

  const fail = async (
    stepId: string,
    error: string,
    input: unknown,
    startedAt: Date,
  ) => {
    await options.onStepUpdate({
      stepId,
      status: 'error',
      input,
      error,
      startedAt,
      finishedAt: new Date(),
    });
  };

  for (const step of ordered) {
    const startedAt = new Date();

    await options.onStepUpdate({
      stepId: step.id,
      status: 'running',
      input: previous,
      startedAt,
    });

    const connector = options.getConnector(step.connectorId);

    if (!connector) {
      await fail(
        step.id,
        `Коннектор не найден: ${step.connectorId}`,
        previous,
        startedAt,
      );

      return 'error';
    }

    try {
      const credentials = await options.getCredentials(
        step.connectionId,
        step.connectorId,
      );
      const result = await connector.execute({
        action: step.action,
        params: step.params ?? {},
        previousResult: previous,
        credentials,
      });

      if (!result.ok) {
        await fail(step.id, result.error || 'Ошибка шага', previous, startedAt);

        return 'error';
      }

      previous = result.data ?? null;

      await options.onStepUpdate({
        stepId: step.id,
        status: 'success' satisfies StepStatus,
        input: step.params,
        output: result.data,
        error: null,
        startedAt,
        finishedAt: new Date(),
      });
    } catch (error) {
      await fail(
        step.id,
        error instanceof Error ? error.message : 'Неизвестная ошибка',
        previous,
        startedAt,
      );

      return 'error';
    }
  }

  return 'success';
};
