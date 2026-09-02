import {
  interpolate,
  templateContext,
  unwrapItems,
  type TemplateContext,
} from '@ai-worker/connectors';
import { isSideEffect } from './side-effects';
import type { RunWorkflowOptions, StepStatus } from './types';
import { matchWhen } from './when';

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

const isEmptyPrevious = (previous: unknown): boolean => {
  if (previous == null) {
    return true;
  }

  if (typeof previous === 'string') {
    return !previous.trim();
  }

  const items = unwrapItems(previous);

  if (items) {
    return items.length === 0;
  }

  if (typeof previous === 'object') {
    const record = previous as Record<string, unknown>;

    if (typeof record['found'] === 'boolean' && record['found'] === false) {
      return true;
    }

    const text = record['text'];

    if (typeof text === 'string' && !text.trim()) {
      return true;
    }

    if (typeof record['count'] === 'number' && record['count'] === 0) {
      return true;
    }
  }

  return false;
};

const flag = (params: Record<string, unknown> | undefined, key: string) => {
  const value = params?.[key];

  return value === true || value === 'true';
};

const stepTimeoutMs = (
  connectorId: string,
  params: Record<string, unknown> | undefined,
): number => {
  const parsed = Number(params?.['timeoutMs']);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return connectorId === 'browser' ? 180_000 : 120_000;
};

const withTimeout = async <T>(ms: number, task: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Таймаут шага (${ms} мс)`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
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

const skip = (reason: string) => ({ skipped: true, reason });

export const runWorkflow = async (
  options: RunWorkflowOptions,
): Promise<'success' | 'error' | 'cancelled'> => {
  const ordered = [...options.steps].sort((a, b) => a.order - b.order);
  let previous: unknown = options.initialInput ?? null;
  const outputs: unknown[] = [];
  const stepBag: Record<string, unknown> = {};
  const prior = new Map(
    (options.priorSteps ?? []).map((item) => [item.stepId, item]),
  );

  const cancelled = async () => Boolean(await options.shouldCancel?.());

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

  const succeed = async (
    stepId: string,
    order: number,
    connectorId: string,
    input: unknown,
    output: unknown,
    startedAt: Date,
  ) => {
    previous = output;
    outputs.push(output);
    remember(stepBag, order, connectorId, output);

    await options.onStepUpdate({
      stepId,
      status: 'success' satisfies StepStatus,
      input,
      output,
      error: null,
      startedAt,
      finishedAt: new Date(),
    });
  };

  for (const step of ordered) {
    if (await cancelled()) {
      return 'cancelled';
    }

    const abort = async (input: unknown, startedAt: Date) => {
      await options.onStepUpdate({
        stepId: step.id,
        status: 'cancelled',
        input,
        error: 'Отменён',
        startedAt,
        finishedAt: new Date(),
      });
    };

    const done = prior.get(step.id);

    if (done?.status === 'success') {
      previous = done.output ?? previous;
      outputs.push(previous);
      remember(stepBag, step.order, step.connectorId, previous);
      continue;
    }

    if (done?.status === 'running' && done.output != null) {
      previous = done.output;
      outputs.push(previous);
      remember(stepBag, step.order, step.connectorId, previous);
      continue;
    }

    if (
      done?.status === 'running' &&
      done.output == null &&
      isSideEffect(step.connectorId, step.action)
    ) {
      await fail(
        step.id,
        'Шаг прерван до записи результата. Исходящее действие не повторяю, чтобы не отправить дважды. Запустите retry.',
        previous,
        new Date(),
      );

      return 'error';
    }

    const startedAt = new Date();
    const contextBase = {
      input: options.initialInput,
      previous,
      steps: stepBag,
    };
    const preview = interpolate(
      step.params ?? {},
      templateContext(contextBase),
    );

    await options.onStepUpdate({
      stepId: step.id,
      status: 'running',
      input: preview,
      startedAt,
    });

    if (await cancelled()) {
      await abort(preview, startedAt);
      return 'cancelled';
    }

    const connector = options.getConnector(step.connectorId);

    if (!connector) {
      await fail(
        step.id,
        `Коннектор не найден: ${step.connectorId}`,
        preview,
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
      const emptyIterate = Array.isArray(items) && items.length === 0;
      const emptyScalar = !step.iterate && isEmptyPrevious(previous);
      const whenOk = matchWhen(
        step.params?.['when'],
        templateContext(contextBase),
      );

      if (!whenOk) {
        await succeed(
          step.id,
          step.order,
          step.connectorId,
          preview,
          skip('when'),
          startedAt,
        );
        continue;
      }

      if (flag(step.params, 'skipIfEmpty') && (emptyIterate || emptyScalar)) {
        await succeed(
          step.id,
          step.order,
          step.connectorId,
          preview,
          skip('empty'),
          startedAt,
        );
        continue;
      }

      const timeoutMs = stepTimeoutMs(step.connectorId, step.params);

      if (items) {
        const collected: unknown[] = [];
        const resolvedItems: unknown[] = [];

        for (const item of items) {
          if (await cancelled()) {
            await abort(resolvedItems, startedAt);
            return 'cancelled';
          }

          const context: TemplateContext = templateContext({
            ...contextBase,
            item,
          });
          const params = interpolate(step.params ?? {}, context) as Record<
            string,
            unknown
          >;

          resolvedItems.push(params);

          if (!matchWhen(params['when'], context)) {
            collected.push(skip('when'));
            continue;
          }

          const result = await withTimeout(
            timeoutMs,
            connector.execute({
              action: step.action,
              params,
              previousResult: item,
              credentials,
              context,
              runtime: options.runtime,
            }),
          );

          if (!result.ok) {
            await fail(
              step.id,
              result.error || 'Ошибка шага',
              params,
              startedAt,
            );

            return 'error';
          }

          collected.push(result.data ?? null);
        }

        const output = { count: collected.length, items: collected };

        await succeed(
          step.id,
          step.order,
          step.connectorId,
          resolvedItems,
          output,
          startedAt,
        );
        continue;
      }

      const context: TemplateContext = templateContext(contextBase);
      const params = interpolate(step.params ?? {}, context) as Record<
        string,
        unknown
      >;
      const result = await withTimeout(
        timeoutMs,
        connector.execute({
          action: step.action,
          params,
          previousResult: previous,
          credentials,
          context,
          runtime: options.runtime,
        }),
      );

      if (!result.ok) {
        await fail(
          step.id,
          result.error || 'Ошибка шага',
          params,
          startedAt,
        );

        return 'error';
      }

      await succeed(
        step.id,
        step.order,
        step.connectorId,
        params,
        result.data ?? null,
        startedAt,
      );
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
