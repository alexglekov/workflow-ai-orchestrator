import {
  templateContext,
  unwrapItems,
  type TemplateContext,
} from '@ai-worker/connectors';
import type { RunWorkflowOptions, StepStatus } from './types';

const itemsForStep = (
  iterate: boolean,
  previous: unknown,
  outputs: unknown[],
): unknown[] | null => {
  if (!iterate) {
    return null;
  }

  const fromPrevious = unwrapItems(previous);

  if (fromPrevious) {
    return fromPrevious;
  }

  for (let index = outputs.length - 1; index >= 0; index -= 1) {
    const found = unwrapItems(outputs[index]);

    if (found) {
      return found;
    }
  }

  if (previous == null) {
    return [];
  }

  return [previous];
};

const remember = (
  steps: Record<string, unknown>,
  order: number,
  connectorId: string,
  output: unknown,
) => {
  steps[String(order)] = output;
  steps[connectorId] = output;
};

export const runWorkflow = async (
  options: RunWorkflowOptions,
): Promise<'success' | 'error'> => {
  const ordered = [...options.steps].sort((a, b) => a.order - b.order);
  let previous: unknown = options.initialInput ?? null;
  const outputs: unknown[] = [];
  const stepBag: Record<string, unknown> = {};

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
    const contextBase = {
      input: options.initialInput,
      previous,
      steps: stepBag,
    };

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
      const items = itemsForStep(Boolean(step.iterate), previous, outputs);

      if (items) {
        const collected: unknown[] = [];

        for (const item of items) {
          const context: TemplateContext = templateContext({
            ...contextBase,
            item,
          });
          const result = await connector.execute({
            action: step.action,
            params: step.params ?? {},
            previousResult: item,
            credentials,
            context,
          });

          if (!result.ok) {
            await fail(
              step.id,
              result.error || 'Ошибка шага',
              item,
              startedAt,
            );

            return 'error';
          }

          collected.push(result.data ?? null);
        }

        const output = { count: collected.length, items: collected };

        previous = output;
        outputs.push(output);
        remember(stepBag, step.order, step.connectorId, output);

        await options.onStepUpdate({
          stepId: step.id,
          status: 'success' satisfies StepStatus,
          input: step.params,
          output,
          error: null,
          startedAt,
          finishedAt: new Date(),
        });

        continue;
      }

      const context: TemplateContext = templateContext(contextBase);
      const result = await connector.execute({
        action: step.action,
        params: step.params ?? {},
        previousResult: previous,
        credentials,
        context,
      });

      if (!result.ok) {
        await fail(step.id, result.error || 'Ошибка шага', previous, startedAt);

        return 'error';
      }

      previous = result.data ?? null;
      outputs.push(previous);
      remember(stepBag, step.order, step.connectorId, previous);

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
