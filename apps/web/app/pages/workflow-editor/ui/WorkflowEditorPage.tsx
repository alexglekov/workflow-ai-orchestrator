import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAtom } from 'jotai';
import {
  askAgent,
  fetchAgents,
  planAgent,
  type AgentMessage,
  type AgentProviderInfo,
  type ComposerMode,
} from '~/entities/agent';
import { connectionsAtom, fetchConnections } from '~/entities/connection';
import {
  catalogAtom,
  fetchCatalog,
  type ConnectorCatalog,
} from '~/entities/connector';
import { startRun } from '~/entities/run';
import {
  createTrigger,
  deleteTrigger,
  fetchTriggers,
  updateTrigger,
  type TriggerType,
  type WorkflowTrigger,
} from '~/entities/trigger';
import {
  fetchWorkflow,
  updateWorkflow,
  workflowAtom,
  type WorkflowStep,
} from '~/entities/workflow';
import {
  AskThread,
  NodePicker,
  PromptForm,
  RunInputDialog,
  StepsEditor,
  TriggerPanel,
  TriggerPicker,
} from '~/features/compose-workflow';
import { errorAtom, loadingAtom } from '~/shared/model/ui';
import { Banner } from '~/shared/ui/Banner';
import { Icon } from '~/shared/ui/Icon';

export const WorkflowEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useAtom(workflowAtom);
  const [catalog, setCatalog] = useAtom(catalogAtom);
  const [connections, setConnections] = useAtom(connectionsAtom);
  const [error, setError] = useAtom(errorAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const [triggerPickerType, setTriggerPickerType] =
    useState<TriggerType>('schedule');
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runInput, setRunInput] = useState('{}');
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [mode, setMode] = useState<ComposerMode>('build');
  const [askDraft, setAskDraft] = useState('');
  const [askMessages, setAskMessages] = useState<AgentMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const [planDraft, setPlanDraft] = useState('');
  const [buildMessages, setBuildMessages] = useState<AgentMessage[]>([]);
  const [planning, setPlanning] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [providerId, setProviderId] = useState('gemini');
  const persistTimer = useRef<ReturnType<typeof setTimeout>>();
  const persistGen = useRef(0);
  const nameRef = useRef(name);
  const promptRef = useRef(prompt);
  const workflowRef = useRef(workflow);

  nameRef.current = name;
  promptRef.current = prompt;
  workflowRef.current = workflow;

  useEffect(
    () => () => {
      clearTimeout(persistTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!id) {
      return;
    }

    void (async () => {
      setWorkflow(null);

      try {
        const [nextWorkflow, nextCatalog, nextConnections, nextAgents] =
          await Promise.all([
            fetchWorkflow(id),
            fetchCatalog(),
            fetchConnections(),
            fetchAgents().catch(() => ({
              active: 'gemini',
              providers: [],
            })),
          ]);

        setWorkflow(nextWorkflow);
        setCatalog(nextCatalog);
        setConnections(nextConnections);
        setProviders(nextAgents.providers);
        setProviderId(nextAgents.active || 'gemini');
        setPrompt(nextWorkflow.prompt);
        setName(nextWorkflow.name);
        setTriggers(await fetchTriggers(id).catch(() => []));
        setMode('build');
        setAskDraft('');
        setAskMessages([]);
        setPlanDraft('');
        setBuildMessages([]);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить workflow',
        );
      }
    })();
  }, [id, setCatalog, setConnections, setError, setWorkflow]);

  if (!workflow) {
    return (
      <div className="canvas-page">
        <div className="canvas-board">
          {error ? (
            <>
              <Banner>{error}</Banner>
              <Link to="/workflows" className="btn ghost">
                Назад к списку
              </Link>
            </>
          ) : (
            <p className="muted">Загрузка…</p>
          )}
        </div>
      </div>
    );
  }

  const persist = async (steps: WorkflowStep[]) => {
    if (!id) {
      return workflow;
    }

    clearTimeout(persistTimer.current);

    const gen = ++persistGen.current;

    try {
      const next = await updateWorkflow(id, {
        prompt: promptRef.current,
        name: nameRef.current.trim() || 'Новый workflow',
        steps: steps.map((step) => ({
          title: step.title,
          connectorId: step.connectorId,
          action: step.action,
          params: step.params,
                          connectionId: step.connectionId ?? undefined,
                          iterate: Boolean(step.iterate),
        })),
      });

      if (gen !== persistGen.current) {
        return next;
      }

      setWorkflow(next);
      setName(next.name);
      setError(null);

      return next;
    } catch (err) {
      if (gen === persistGen.current) {
        setError(
          err instanceof Error ? err.message : 'Не удалось сохранить workflow',
        );
      }

      throw err;
    }
  };

  const schedulePersist = (steps: WorkflowStep[]) => {
    persistGen.current += 1;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void persist(steps).catch(() => undefined);
    }, 450);
  };

  const commitName = async () => {
    const nextName = name.trim() || 'Новый workflow';

    setName(nextName);

    if (!id || nextName === workflow.name) {
      return;
    }

    const next = await updateWorkflow(id, { name: nextName });

    setWorkflow(next);
    setName(next.name);
  };

  const plan = async () => {
    if (!id || planning) {
      return;
    }

    const followUp = buildMessages.length > 0;
    const message = (followUp ? planDraft : prompt).trim();

    if (!message) {
      return;
    }

    const history = buildMessages;
    const task = followUp ? prompt : message;

    setPlanDraft('');
    setBuildMessages([...history, { role: 'user', content: message }]);
    setPlanning(true);
    persistGen.current += 1;
    clearTimeout(persistTimer.current);

    try {
      const result = await planAgent({
        prompt: task,
        message,
        providerId,
        workflowId: id,
        history,
      });

      setBuildMessages((current) => [
        ...current,
        { role: 'assistant', content: result.message },
      ]);

      if (result.kind === 'workflow' && result.workflow) {
        setWorkflow(result.workflow);
        setName(result.workflow.name);
        workflowRef.current = result.workflow;
      }

      setError(null);
    } catch (err) {
      const content =
        err instanceof Error ? err.message : 'Не удалось составить workflow';

      setBuildMessages((current) => [
        ...current,
        { role: 'assistant', content, status: 'error' },
      ]);
      setError(null);
    } finally {
      setPlanning(false);
    }
  };

  const ask = async () => {
    const message = askDraft.trim();

    if (!message || asking) {
      return;
    }

    const history = askMessages;

    setAskDraft('');
    setAskMessages([...history, { role: 'user', content: message }]);
    setAsking(true);

    try {
      const reply = await askAgent({
        message,
        providerId,
        workflowId: id,
        history,
      });

      setAskMessages((current) => [
        ...current,
        { role: 'assistant', content: reply.message },
      ]);
      setError(null);
    } catch (err) {
      const content =
        err instanceof Error ? err.message : 'Не удалось спросить агента';

      setAskMessages((current) => [
        ...current,
        { role: 'assistant', content, status: 'error' },
      ]);
      setError(null);
    } finally {
      setAsking(false);
    }
  };

  const replaceSteps = (steps: WorkflowStep[], immediate = false) => {
    const current = workflowRef.current;

    if (!current) {
      return;
    }

    const nextWorkflow = { ...current, steps };

    setWorkflow(nextWorkflow);
    workflowRef.current = nextWorkflow;

    if (immediate) {
      void persist(steps).catch(() => undefined);
      return;
    }

    schedulePersist(steps);
  };

  const updateStep = (index: number, patch: Partial<WorkflowStep>) => {
    const current = workflowRef.current;

    if (!current) {
      return;
    }

    replaceSteps(
      current.steps.map((step, order) =>
        order === index ? { ...step, ...patch } : step,
      ),
    );
  };

  const removeStep = (index: number) => {
    const current = workflowRef.current;

    if (!current) {
      return;
    }

    replaceSteps(
      current.steps
        .filter((_, order) => order !== index)
        .map((step, order) => ({ ...step, order: order + 1 })),
      true,
    );
  };

  const addNode = (connector: ConnectorCatalog) => {
    const current = workflowRef.current;

    if (!current) {
      return;
    }

    const action = connector.actions[0];

    setPickerOpen(false);
    replaceSteps(
      [
        ...current.steps,
        {
          id: `tmp-${Date.now()}`,
          order: current.steps.length + 1,
          title: action?.name || connector.name,
          connectorId: connector.id,
          action: action?.id || '',
          params: {},
          connectionId: null,
          iterate: false,
        },
      ],
      true,
    );
  };

  const openTriggerPicker = (type: TriggerType = 'schedule') => {
    setTriggerPickerType(type);
    setTriggerPickerOpen(true);
  };

  const addTrigger = async (
    type: TriggerType,
    everyMinutes?: number,
    at?: string,
    timezone?: string,
  ) => {
    if (!id) {
      return;
    }

    setTriggerPickerOpen(false);

    try {
      const created = await createTrigger(id, {
        type,
        everyMinutes,
        at,
        timezone,
      });

      setTriggers((current) => [...current, created]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить триггер');
    }
  };

  const changeTriggerTiming = async (
    triggerId: string,
    everyMinutes: number,
    at: string,
    timezone: string,
  ) => {
    try {
      const next = await updateTrigger(triggerId, {
        everyMinutes,
        at: at || null,
        timezone: at ? timezone : undefined,
      });

      setTriggers((current) =>
        current.map((item) =>
          item.id === triggerId
            ? { ...item, ...next, webhookUrl: item.webhookUrl }
            : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось обновить расписание',
      );
    }
  };

  const toggleTrigger = async (triggerId: string, enabled: boolean) => {
    try {
      const next = await updateTrigger(triggerId, { enabled });

      setTriggers((current) =>
        current.map((item) =>
          item.id === triggerId
            ? { ...item, ...next, webhookUrl: item.webhookUrl }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить триггер');
    }
  };

  const removeTrigger = async (triggerId: string) => {
    try {
      await deleteTrigger(triggerId);
      setTriggers((current) => current.filter((item) => item.id !== triggerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить триггер');
    }
  };

  const run = async (inputOverride?: Record<string, unknown>) => {
    if (!id) {
      return;
    }

    setLoading(true);

    try {
      await persist(workflowRef.current?.steps ?? workflow.steps);
      let input: Record<string, unknown> = inputOverride ?? {};

      if (inputOverride === undefined) {
        try {
          input = JSON.parse(runInput || '{}') as Record<string, unknown>;
        } catch {
          throw new Error('Input должен быть JSON-объектом');
        }
      }

      const created = await startRun(id, input);

      navigate(`/runs/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить');
    } finally {
      setLoading(false);
    }
  };

  const changePrompt = (value: string) => {
    setPrompt(value);
    promptRef.current = value;
    schedulePersist(workflowRef.current?.steps ?? workflow.steps);
  };

  const empty = workflow.steps.length === 0;
  const buildFollowUp = buildMessages.length > 0;
  const composerBusy = mode === 'ask' ? asking : planning;
  const composerValue =
    mode === 'ask' ? askDraft : buildFollowUp ? planDraft : prompt;
  const changeComposer = (value: string) => {
    if (mode === 'ask') {
      setAskDraft(value);
      return;
    }

    if (buildFollowUp) {
      setPlanDraft(value);
      return;
    }

    changePrompt(value);
  };

  return (
    <div className={`canvas-page editor-page${empty ? ' is-empty' : ''}`}>
      <header className="canvas-chrome">
        <Link
          to="/workflows"
          className="icon-btn"
          aria-label="К списку"
          onClick={() =>
            void persist(
              workflowRef.current?.steps ?? workflow.steps,
            ).catch(() => undefined)
          }
        >
          <Icon name="home" size={16} />
        </Link>
        <input
          className="canvas-title"
          value={name}
          placeholder="Новый workflow"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          aria-label="Название workflow"
        />
        <div className="chrome-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPickerOpen(true)}
            aria-label="Добавить шаг"
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => openTriggerPicker('schedule')}
            aria-label="Добавить триггер"
          >
            <Icon name="clock" size={16} />
          </button>
          <button
            type="button"
            className="play-btn labeled"
            onClick={(event) => {
              if (event.shiftKey) {
                setRunDialogOpen(true);
                return;
              }

              void run({});
            }}
            disabled={loading || empty}
            title="Запуск. Shift+клик — с JSON input"
          >
            <Icon name="play" size={13} />
            Run
          </button>
        </div>
      </header>
      {error ? <Banner>{error}</Banner> : null}
      <div className="editor-body">
        <TriggerPanel
          triggers={triggers}
          onOpenPicker={openTriggerPicker}
          onToggle={(triggerId, enabled) =>
            void toggleTrigger(triggerId, enabled)
          }
          onRemove={(triggerId) => void removeTrigger(triggerId)}
          onTiming={(triggerId, everyMinutes, at, timezone) =>
            void changeTriggerTiming(triggerId, everyMinutes, at, timezone)
          }
        />
        <div className={`editor-main${empty ? ' is-empty' : ''}`}>
          {empty ? (
            <div className="editor-hero">
              {mode === 'build' && !buildFollowUp ? (
                <div className="start-tiles">
                  <button
                    type="button"
                    className="start-tile"
                    onClick={() => openTriggerPicker('schedule')}
                  >
                    <span className="tile-icon green">
                      <Icon name="target" size={18} />
                    </span>
                    <strong>Начать с триггера</strong>
                  </button>
                  <button
                    type="button"
                    className="start-tile"
                    onClick={() => setPickerOpen(true)}
                  >
                    <span className="tile-icon blue">
                      <Icon name="blocks" size={16} />
                    </span>
                    <strong>Добавить шаг</strong>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="composer-dock">
            <AskThread
              messages={mode === 'ask' ? askMessages : buildMessages}
              loading={mode === 'ask' ? asking : planning}
            />
            <PromptForm
              mode={mode}
              prompt={composerValue}
              loading={composerBusy}
              providers={providers}
              providerId={providerId}
              onModeChange={setMode}
              onPromptChange={changeComposer}
              onProviderChange={setProviderId}
              onSubmit={() => void (mode === 'ask' ? ask() : plan())}
              placeholder={
                mode === 'ask'
                  ? undefined
                  : buildFollowUp
                    ? 'Ответьте на уточняющие вопросы агента'
                    : undefined
              }
            />
          </div>
        </div>
        {empty ? null : (
          <section className="canvas-flow">
            <StepsEditor
              steps={workflow.steps}
              catalog={catalog}
              connections={connections}
              onChange={updateStep}
              onRemove={removeStep}
            />
          </section>
        )}
      </div>
      {pickerOpen ? (
        <NodePicker
          catalog={catalog}
          onClose={() => setPickerOpen(false)}
          onPick={(connector) => void addNode(connector)}
        />
      ) : null}
      {triggerPickerOpen ? (
        <TriggerPicker
          key={triggerPickerType}
          initialType={triggerPickerType}
          onClose={() => setTriggerPickerOpen(false)}
          onPick={(type, everyMinutes, at, timezone) =>
            void addTrigger(type, everyMinutes, at, timezone)
          }
        />
      ) : null}
      {runDialogOpen ? (
        <RunInputDialog
          value={runInput}
          onChange={setRunInput}
          onCancel={() => setRunDialogOpen(false)}
          onRun={() => {
            setRunDialogOpen(false);
            void run();
          }}
        />
      ) : null}
    </div>
  );
};
