import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAtom } from 'jotai';
import {
  askAgent,
  chatAgent,
  fetchAgents,
  fetchWorkflowChat,
  fetchWorkflowChatPage,
  type AgentMessage,
  type AgentProviderInfo,
  type ComposerMode,
} from '~/entities/agent';
import { connectionsAtom, fetchConnections } from '~/entities/connection';
import { catalogAtom, fetchCatalog } from '~/entities/connector';
import {
  cancelRun,
  fetchRun,
  retryRun,
  startRun,
  type Run,
} from '~/entities/run';
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
  appendWorkflowChat,
  settleWorkflowChat,
  startWorkflowLive,
  stopWorkflowLive,
  type WorkflowStep,
} from '~/entities/workflow';
import {
  AskThread,
  PromptForm,
  RunInputDialog,
  StepsEditor,
  TriggerPanel,
  TriggerPicker,
} from '~/features/compose-workflow';
import { ChatHistoryDrawer } from '~/features/browse-chats';
import {
  connectIntentId,
  connectMark,
  connectedStatusMessage,
  connectorTitle,
  isLaunchIntent,
  isDoItTask,
  isRunNowIntent,
  isStopIntent,
  LAUNCH_MARK,
  launchedStatusMessage,
  parseChatActions,
  runMark,
  STATUS_LAUNCHED_MARK,
  stoppedStatusMessage,
  stripChatMarks,
  unresolvedConnectorIds,
} from '~/shared/lib/chat-actions';
import { runReplyText } from '~/shared/lib/humanize';
import { isEventTrigger, isLiveTrigger } from '~/shared/lib/event-steps';
import { isActiveRun } from '~/shared/lib/status';
import { errorAtom, loadingAtom } from '~/shared/model/ui';
import { Banner } from '~/shared/ui/Banner';
import { Icon } from '~/shared/ui/Icon';

const AGENT_STORAGE_KEY = 'workflow-agent';

const fallbackAgents = (): AgentProviderInfo[] => [
  {
    id: 'orchestrator',
    name: 'Auto',
    available: true,
    capabilities: ['ask', 'plan'],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    available: true,
    capabilities: ['ask', 'plan'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    available: false,
    capabilities: ['ask', 'plan'],
  },
];

const sortAgents = (providers: AgentProviderInfo[]) => {
  const order = ['orchestrator', 'qwen', 'openai'];

  return [...providers].sort((left, right) => {
    const a = order.indexOf(left.id);
    const b = order.indexOf(right.id);

    return (a < 0 ? 99 : a) - (b < 0 ? 99 : b);
  });
};

const readStoredAgent = () => {
  try {
    return localStorage.getItem(AGENT_STORAGE_KEY) || 'orchestrator';
  } catch {
    return 'orchestrator';
  }
};

export const WorkflowEditorPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [workflow, setWorkflow] = useAtom(workflowAtom);
  const [catalog, setCatalog] = useAtom(catalogAtom);
  const [connections, setConnections] = useAtom(connectionsAtom);
  const [error, setError] = useAtom(errorAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const [triggerPickerType, setTriggerPickerType] =
    useState<TriggerType>('schedule');
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runInput, setRunInput] = useState('{}');
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [mode, setMode] = useState<ComposerMode>('build');
  const [askDraft, setAskDraft] = useState('');
  const [askMessages, setAskMessages] = useState<AgentMessage[]>([]);
  const [askHasMore, setAskHasMore] = useState(false);
  const [askLoadingMore, setAskLoadingMore] = useState(false);
  const [asking, setAsking] = useState(false);
  const [planDraft, setPlanDraft] = useState('');
  const [buildMessages, setBuildMessages] = useState<AgentMessage[]>([]);
  const [buildHasMore, setBuildHasMore] = useState(false);
  const [buildLoadingMore, setBuildLoadingMore] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [preferredTelegramKind, setPreferredTelegramKind] = useState<
    'bot' | 'business' | undefined
  >();
  const [mobileTab, setMobileTab] = useState<'triggers' | 'chat' | 'flow'>(
    'chat',
  );
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [agents, setAgents] = useState<AgentProviderInfo[]>(fallbackAgents);
  const [providerId, setProviderId] = useState('orchestrator');
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persistGen = useRef(0);
  const nameRef = useRef(name);
  const promptRef = useRef(prompt);
  const workflowRef = useRef(workflow);
  const sessionBindings = useRef<Record<string, string>>({});
  const postedRunReplies = useRef(new Set<string>());
  const seenLiveRuns = useRef(new Set<string>());
  const buildMessagesRef = useRef(buildMessages);
  const postAssistantRef = useRef<
    ((thread: 'ask' | 'build', content: string) => Promise<void>) | null
  >(null);

  nameRef.current = name;
  promptRef.current = prompt;
  workflowRef.current = workflow;
  buildMessagesRef.current = buildMessages;

  useEffect(() => {
    void fetchAgents()
      .then((catalog) => {
        const providers = sortAgents(
          catalog.providers.length ? catalog.providers : fallbackAgents(),
        );
        const stored = readStoredAgent();
        const next =
          providers.find((item) => item.id === stored && item.available)?.id ||
          providers.find((item) => item.available)?.id ||
          'orchestrator';

        setAgents(providers);
        setProviderId(next);
      })
      .catch(() => {
        setAgents(fallbackAgents());
      });
  }, []);

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
        const [nextWorkflow, nextCatalog, nextConnections, nextChat] =
          await Promise.all([
            fetchWorkflow(id),
            fetchCatalog(),
            fetchConnections(),
            fetchWorkflowChat(id).catch(() => ({
              ask: { messages: [], hasMore: false },
              build: { messages: [], hasMore: false },
            })),
          ]);

        setWorkflow(nextWorkflow);
        setCatalog(nextCatalog);
        setConnections(nextConnections);
        setPrompt(nextWorkflow.prompt);
        setName(nextWorkflow.name);
        setTriggers(await fetchTriggers(id).catch(() => []));
        setMode('build');
        setAskDraft('');
        setAskMessages(nextChat.ask.messages);
        setAskHasMore(nextChat.ask.hasMore);
        setAskLoadingMore(false);
        setPlanDraft('');
        setBuildMessages(nextChat.build.messages);
        setBuildHasMore(nextChat.build.hasMore);
        setBuildLoadingMore(false);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить workflow',
        );
      }
    })();
  }, [id, setCatalog, setConnections, setError, setWorkflow]);

  useEffect(() => {
    const hasFlow =
      Boolean(workflow?.steps.length) || triggers.length > 0;

    if (!hasFlow && mobileTab === 'flow') {
      setMobileTab('chat');
    }
  }, [workflow, triggers.length, mobileTab]);

  useEffect(() => {
    setHistoryOpen(false);
  }, [id]);

  useEffect(() => {
    const ids = [
      ...new Set(
        [...askMessages, ...buildMessages]
          .map((item) => parseChatActions(item.content).runId)
          .filter((item): item is string => Boolean(item)),
      ),
    ];
    const queryRun = searchParams.get('run');

    if (queryRun && !ids.includes(queryRun)) {
      ids.push(queryRun);
    }

    if (!ids.length) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      const next: Record<string, Run> = {};
      let again = false;

      await Promise.all(
        ids.map(async (runId) => {
          try {
            const run = await fetchRun(runId);
            next[runId] = run;

            if (run.status === 'pending' || run.status === 'running') {
              again = true;
              seenLiveRuns.current.add(runId);
            }
          } catch {
            return;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setRuns((current) => {
        const merged = { ...current };

        for (const [id, fetched] of Object.entries(next)) {
          const prev = current[id];

          if (
            prev?.cancelRequested &&
            (fetched.status === 'pending' || fetched.status === 'running') &&
            !fetched.cancelRequested
          ) {
            merged[id] = { ...fetched, cancelRequested: true };
          } else {
            merged[id] = fetched;
          }
        }

        return merged;
      });

      for (const run of Object.values(next)) {
        if (run.status !== 'success' || run.cancelRequested) {
          continue;
        }

        if (run.source && !['manual', 'retry'].includes(run.source)) {
          continue;
        }

        const reply = runReplyText(run.steps);

        if (!reply || postedRunReplies.current.has(run.id)) {
          continue;
        }

        const already = buildMessagesRef.current.some(
          (item) =>
            item.role === 'assistant' &&
            stripChatMarks(item.content).trim() === reply,
        );

        if (already) {
          postedRunReplies.current.add(run.id);
          continue;
        }

        const finished = run.finishedAt
          ? Date.now() - new Date(run.finishedAt).getTime()
          : Number.POSITIVE_INFINITY;
        const fresh = finished < 90_000;

        if (!seenLiveRuns.current.has(run.id) && !fresh) {
          continue;
        }

        postedRunReplies.current.add(run.id);
        void postAssistantRef.current?.('build', reply);
      }

      if (again) {
        timer = window.setTimeout(() => void tick(), 1200);
      }
    };

    void tick();

    return () => {
      cancelled = true;

      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [askMessages, buildMessages, searchParams]);

  const importedRun = useRef<string | null>(null);

  useEffect(() => {
    const queryRun = searchParams.get('run');

    if (!queryRun || !id || importedRun.current === queryRun) {
      return;
    }

    importedRun.current = queryRun;
    setMode('build');
    setBuildMessages((current) => {
      if (
        current.some(
          (item) => parseChatActions(item.content).runId === queryRun,
        )
      ) {
        return current;
      }

      return [
        ...current,
        {
          role: 'assistant',
          content: `Запуск сценария.\n${runMark(queryRun)}`,
        },
      ];
    });
  }, [id, searchParams]);

  const loadOlderChat = useCallback(async () => {
    if (!id) {
      return;
    }

    const thread = mode === 'ask' ? 'ask' : 'build';
    const loading = thread === 'ask' ? askLoadingMore : buildLoadingMore;
    const more = thread === 'ask' ? askHasMore : buildHasMore;
    const list = thread === 'ask' ? askMessages : buildMessages;
    const before = list.find((item) => item.id)?.id;

    if (loading || !more || !before) {
      return;
    }

    if (thread === 'ask') {
      setAskLoadingMore(true);
    } else {
      setBuildLoadingMore(true);
    }

    try {
      const page = await fetchWorkflowChatPage(id, thread, before);
      const merge = (current: AgentMessage[]) => {
        const seen = new Set(current.map((item) => item.id).filter(Boolean));

        return [
          ...page.messages.filter((item) => !item.id || !seen.has(item.id)),
          ...current,
        ];
      };

      if (thread === 'ask') {
        setAskMessages(merge);
        setAskHasMore(page.hasMore);
      } else {
        setBuildMessages(merge);
        setBuildHasMore(page.hasMore);
      }
    } catch {
      if (thread === 'ask') {
        setAskHasMore(false);
      } else {
        setBuildHasMore(false);
      }
    } finally {
      if (thread === 'ask') {
        setAskLoadingMore(false);
      } else {
        setBuildLoadingMore(false);
      }
    }
  }, [
    id,
    mode,
    askLoadingMore,
    buildLoadingMore,
    askHasMore,
    buildHasMore,
    askMessages,
    buildMessages,
  ]);

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
      const nextTriggers = await fetchTriggers(id).catch(() => null);

      if (nextTriggers) {
        setTriggers(nextTriggers);
      }

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

  const postAssistant = async (
    thread: 'ask' | 'build',
    content: string,
  ) => {
    if (!id) {
      return;
    }

    if (thread === 'ask') {
      setAskMessages((current) => [...current, { role: 'assistant', content }]);
    } else {
      setBuildMessages((current) => [
        ...current,
        { role: 'assistant', content },
      ]);
    }

    await appendWorkflowChat(id, {
      thread,
      messages: [{ role: 'assistant', content }],
    }).catch(() => undefined);
  };

  postAssistantRef.current = postAssistant;

  const applySettle = (
    thread: 'ask' | 'build',
    match: string,
    options: { rewrite?: string; content?: string },
  ) => {
    const setter = thread === 'ask' ? setAskMessages : setBuildMessages;

    setter((current) => {
      let next = current;

      if (options.rewrite) {
        let last = -1;

        current.forEach((item, index) => {
          if (item.role === 'assistant' && item.content.includes(match)) {
            last = index;
          }
        });

        if (last >= 0) {
          next = current.map((item, index) =>
            index === last ? { ...item, content: options.rewrite ?? item.content } : item,
          );
        }
      } else {
        next = current.filter(
          (item) =>
            !(item.role === 'assistant' && item.content.includes(match)),
        );
      }

      if (options.content) {
        next = [...next, { role: 'assistant', content: options.content }];
      }

      return next;
    });
  };

  const settleThread = async (
    thread: 'ask' | 'build',
    match: string,
    options: { rewrite?: string; content?: string } = {},
  ) => {
    if (!id) {
      return;
    }

    applySettle(thread, match, options);
    await settleWorkflowChat(id, { thread, match, ...options }).catch(
      () => undefined,
    );
  };

  const eventTriggersOf = (items: WorkflowTrigger[]) =>
    items.filter((item) => isEventTrigger(item.type));

  const liveTriggersOf = (items: WorkflowTrigger[]) =>
    items.filter(
      (item) =>
        item.enabled &&
        (item.type === 'schedule' || isEventTrigger(item.type)),
    );

  const launchFromChat = async () => {
    if (!id || launching || stopping) {
      return;
    }

    const current = workflowRef.current ?? workflow;
    const missing = unresolvedConnectorIds(current.steps, connections);
    const alreadyLive =
      current.steps.length > 0 &&
      missing.length === 0 &&
      liveTriggersOf(triggers).length > 0;

    setMode('build');
    setMobileTab('chat');

    if (missing.length) {
      await postAssistant(
        'build',
        `Сначала выберите или создайте подключения в чате.\n${missing.map(connectMark).join('\n')}`,
      );
      return;
    }

    if (!current.steps.length) {
      await postAssistant(
        'build',
        'Сначала опишите задачу — я соберу шаги, потом запустим.',
      );
      return;
    }

    if (alreadyLive) {
      await settleThread('build', LAUNCH_MARK, {
        content: launchedStatusMessage(),
      });
      return;
    }

    setLaunching(true);

    try {
      await persist(current.steps);
      const { started } = await startWorkflowLive(id);
      setTriggers(await fetchTriggers(id).catch(() => triggers));

      if (started > 0) {
        await settleThread('build', LAUNCH_MARK, {
          content: launchedStatusMessage(),
        });
        setError(null);
        return;
      }

      const created = await startRun(id, {});

      setRuns((currentRuns) => ({ ...currentRuns, [created.id]: created }));
      await settleThread('build', LAUNCH_MARK, {
        content: launchedStatusMessage(created.id),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить');
    } finally {
      setLaunching(false);
    }
  };

  const runOnceFromChat = async (
    note = 'Беру на себя.',
    boundConnections = connections,
  ) => {
    if (!id || launching || stopping) {
      return;
    }

    const current = workflowRef.current ?? workflow;
    const missing = unresolvedConnectorIds(current.steps, boundConnections);

    setMode('build');
    setMobileTab('chat');

    if (missing.length) {
      await postAssistant(
        'build',
        `Сначала выберите или создайте подключения в чате.\n${missing.map(connectMark).join('\n')}`,
      );
      return;
    }

    if (!current.steps.length) {
      await postAssistant(
        'build',
        'Сначала опишите задачу — соберу шаги и сразу сделаю.',
      );
      return;
    }

    setLaunching(true);

    try {
      await persist(current.steps);
      const created = await startRun(id, {});

      setRuns((currentRuns) => ({ ...currentRuns, [created.id]: created }));
      await postAssistant('build', `${note}\n${runMark(created.id)}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить');
    } finally {
      setLaunching(false);
    }
  };

  const stopBot = async () => {
    if (!id || stopping || launching) {
      return;
    }

    setStopping(true);
    setTriggers((current) =>
      current.map((item) =>
        item.enabled &&
        (item.type === 'schedule' || isEventTrigger(item.type))
          ? { ...item, enabled: false }
          : item,
      ),
    );
    setWorkflow((current) =>
      current
        ? {
            ...current,
            triggers: (current.triggers ?? []).map((item) =>
              item.enabled &&
              (item.type === 'schedule' || isEventTrigger(item.type))
                ? { ...item, enabled: false }
                : item,
            ),
          }
        : current,
    );
    setRuns((current) => {
      const next = { ...current };

      for (const [runId, run] of Object.entries(next)) {
        if (run.status === 'pending' || run.status === 'running') {
          next[runId] = {
            ...run,
            cancelRequested: true,
            status: run.status === 'pending' ? 'cancelled' : run.status,
          };
        }
      }

      return next;
    });
    applySettle('build', LAUNCH_MARK, {});
    applySettle('build', STATUS_LAUNCHED_MARK, {
      content: stoppedStatusMessage(),
    });

    try {
      const active = Object.values(runs).filter((item) => isActiveRun(item));

      await stopWorkflowLive(id);

      const cancelled = await Promise.all(
        active.map((item) => cancelRun(item.id).catch(() => item)),
      );

      setRuns((current) => {
        const next = { ...current };

        for (const item of cancelled) {
          next[item.id] = {
            ...item,
            cancelRequested: true,
          };
        }

        return next;
      });

      const nextTriggers = await fetchTriggers(id).catch(() => null);

      if (nextTriggers) {
        setTriggers(nextTriggers);
        setWorkflow((current) =>
          current ? { ...current, triggers: nextTriggers } : current,
        );
      }

      await settleWorkflowChat(id, {
        thread: 'build',
        match: LAUNCH_MARK,
      }).catch(() => undefined);
      await settleWorkflowChat(id, {
        thread: 'build',
        match: STATUS_LAUNCHED_MARK,
        content: stoppedStatusMessage(),
      }).catch(() => undefined);
      await postAssistant(
        'build',
        `Можно запустить снова.\n${LAUNCH_MARK}`,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось остановить');

      const nextTriggers = await fetchTriggers(id).catch(() => null);

      if (nextTriggers) {
        setTriggers(nextTriggers);
      }
    } finally {
      setStopping(false);
    }
  };

  const handleComposer = async () => {
    const thread: 'ask' | 'build' = mode === 'ask' ? 'ask' : 'build';
    const followUp = thread === 'build' && buildMessages.length > 0;
    const message = (
      thread === 'ask' ? askDraft : followUp ? planDraft : promptRef.current
    ).trim();

    if (!message || (thread === 'ask' ? asking : planning) || !id) {
      return;
    }

    const connectId = connectIntentId(message);
    const history = thread === 'ask' ? askMessages : buildMessages;

    if (connectId) {
      if (thread === 'ask') {
        setAskDraft('');
        setAskMessages([...history, { role: 'user', content: message }]);
      } else {
        setPlanDraft('');
        setBuildMessages([...history, { role: 'user', content: message }]);
      }

      await appendWorkflowChat(id, {
        thread,
        messages: [{ role: 'user', content: message }],
      }).catch(() => undefined);
      await postAssistant(
        thread,
        `Подключите ${connectorTitle(connectId)} прямо здесь.\n${connectMark(connectId)}`,
      );
      return;
    }

    if (isStopIntent(message)) {
      if (thread === 'ask') {
        setAskDraft('');
        setAskMessages([...history, { role: 'user', content: message }]);
      } else {
        setPlanDraft('');
        setBuildMessages([...history, { role: 'user', content: message }]);
      }

      await appendWorkflowChat(id, {
        thread,
        messages: [{ role: 'user', content: message }],
      }).catch(() => undefined);

      const live = liveTriggersOf(triggers);
      const active = Object.values(runs).filter((item) => isActiveRun(item));

      if (!live.length && !active.length) {
        await postAssistant('build', 'Бот уже остановлен.');
        return;
      }

      await stopBot();
      return;
    }

    if (isRunNowIntent(message, (workflowRef.current ?? workflow).steps.length > 0)) {
      setMode('build');
      setMobileTab('chat');

      if (thread === 'ask') {
        setAskDraft('');
      } else {
        setPlanDraft('');
      }

      setBuildMessages((current) => [
        ...(thread === 'build' ? history : current),
        { role: 'user', content: message },
      ]);

      await appendWorkflowChat(id, {
        thread: 'build',
        messages: [{ role: 'user', content: message }],
      }).catch(() => undefined);

      await runOnceFromChat('Запускаю сейчас, не жду расписание.');
      return;
    }

    if (isLaunchIntent(message)) {
      if (thread === 'ask') {
        setAskDraft('');
        setAskMessages([...history, { role: 'user', content: message }]);
      } else {
        setPlanDraft('');
        setBuildMessages([...history, { role: 'user', content: message }]);
      }

      await appendWorkflowChat(id, {
        thread,
        messages: [{ role: 'user', content: message }],
      }).catch(() => undefined);

      const alreadyLive = liveTriggersOf(triggers).length > 0;

      if (alreadyLive) {
        await postAssistant(
          'build',
          'Бот уже работает. Можно только остановить.',
        );
        return;
      }

      await launchFromChat();
      return;
    }

    if (thread === 'ask') {
      await ask();
      return;
    }

    await plan();
  };

  const plan = async () => {
    if (!id || planning) {
      return;
    }

    const followUp = buildMessages.length > 0;
    const message = (followUp ? planDraft : promptRef.current).trim();

    if (!message) {
      return;
    }

    const history = buildMessages;
    const task = followUp ? promptRef.current : message;

    setPlanDraft('');
    setBuildMessages([...history, { role: 'user', content: message }]);
    setPlanning(true);
    persistGen.current += 1;
    clearTimeout(persistTimer.current);

    try {
      const result = await chatAgent({
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

      if (
        result.telegramKind === 'bot' ||
        result.telegramKind === 'business'
      ) {
        setPreferredTelegramKind(result.telegramKind);
      }

      const nextConnections = await fetchConnections().catch(() => null);

      if (nextConnections) {
        setConnections(nextConnections);
      }

      if (result.kind === 'workflow' && result.workflow) {
        const nextSteps = applySessionBindings(result.workflow.steps);
        const nextWorkflow = { ...result.workflow, steps: nextSteps };

        setWorkflow(nextWorkflow);
        setName(nextWorkflow.name);
        workflowRef.current = nextWorkflow;

        if (
          nextSteps.some(
            (step, index) =>
              step.connectionId !== result.workflow?.steps[index]?.connectionId,
          )
        ) {
          replaceSteps(nextSteps, true);
        }
      }

      const parsed = parseChatActions(result.message);
      const readySteps = workflowRef.current?.steps ?? result.workflow?.steps ?? [];
      const boundReady =
        readySteps.length > 0 &&
        unresolvedConnectorIds(readySteps, nextConnections ?? connections)
          .length === 0;

      if (
        isDoItTask(message) &&
        boundReady &&
        !parsed.runId &&
        !parsed.launch
      ) {
        await runOnceFromChat();
      }

      const nextTriggers = await fetchTriggers(id).catch(() => null);

      if (nextTriggers) {
        setTriggers(nextTriggers);
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

  const applySessionBindings = (steps: WorkflowStep[]) =>
    steps.map((step) => {
      const bound = step.connectionId || sessionBindings.current[step.connectorId];

      return bound && bound !== step.connectionId
        ? { ...step, connectionId: bound }
        : step;
    });

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
      setMobileTab('triggers');
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

      if (!isEventTrigger(next.type)) {
        return;
      }

      if (enabled) {
        await settleThread('build', LAUNCH_MARK, {
          content: launchedStatusMessage(),
        });
        return;
      }

      await settleThread('build', LAUNCH_MARK, {});
      await settleThread('build', STATUS_LAUNCHED_MARK, {
        content: stoppedStatusMessage(),
      });
      await postAssistant('build', `Можно запустить снова.\n${LAUNCH_MARK}`);
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

    if (inputOverride && Object.keys(inputOverride).length) {
      setLoading(true);

      try {
        await persist(workflowRef.current?.steps ?? workflow.steps);
        const created = await startRun(id, inputOverride);

        setRuns((current) => ({ ...current, [created.id]: created }));
        await settleThread('build', LAUNCH_MARK, {
          content: launchedStatusMessage(created.id),
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось запустить');
      } finally {
        setLoading(false);
      }

      return;
    }

    await launchFromChat();
  };

  const changePrompt = (value: string) => {
    setPrompt(value);
    promptRef.current = value;
    schedulePersist(workflowRef.current?.steps ?? workflow.steps);
  };

  const empty = workflow.steps.length === 0;
  const showFlow = !empty || triggers.length > 0;
  const buildFollowUp = buildMessages.length > 0;
  const composerBusy = mode === 'ask' ? asking : planning;
  const eventTriggers = eventTriggersOf(triggers);
  const connectorsReady =
    workflow.steps.length > 0 &&
    unresolvedConnectorIds(workflow.steps, connections).length === 0;
  const eventLive =
    connectorsReady && eventTriggers.some((item) => item.enabled);
  const runLive = Object.values(runs).some((item) => isActiveRun(item));
  const scheduleLive = triggers.some(
    (item) => item.type === 'schedule' && item.enabled,
  );
  const botLive = eventLive || runLive || scheduleLive;
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
    <div
      className={`canvas-page editor-page${empty ? ' is-empty' : ''}`}
      data-mobile-tab={mobileTab}
    >
      <header className="canvas-chrome">
        <Link
          to="/workflows"
          className="icon-btn home-desktop"
          aria-label="К списку"
          onClick={() =>
            void persist(
              workflowRef.current?.steps ?? workflow.steps,
            ).catch(() => undefined)
          }
        >
          <Icon name="home" size={16} />
        </Link>
        <button
          type="button"
          className="icon-btn home-mobile"
          aria-label="Чаты"
          onClick={() => setHistoryOpen(true)}
        >
          <Icon name="home" size={16} />
        </button>
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
            onClick={() => openTriggerPicker('schedule')}
            aria-label="Добавить триггер"
          >
            <Icon name="clock" size={16} />
          </button>
          {botLive || stopping ? (
            <span
              className="chrome-live"
              title={
                stopping
                  ? 'Останавливаю сценарий'
                  : eventLive
                    ? 'Бот слушает входящие сообщения'
                    : 'Сценарий выполняется'
              }
            >
              <span className="live-dot" />
              {stopping
                ? 'Останавливаю'
                : eventLive
                  ? 'Бот работает'
                  : 'Идёт запуск'}
            </span>
          ) : null}
          {botLive || stopping ? (
            <button
              type="button"
              className="play-btn labeled is-stop"
              onClick={() => void stopBot()}
              disabled={loading || launching || stopping}
            >
              <Icon name="stop" size={13} />
              <span className="play-label">Стоп</span>
            </button>
          ) : (
            <button
              type="button"
              className="play-btn labeled"
              onClick={(event) => {
                if (event.shiftKey) {
                  setRunDialogOpen(true);
                  return;
                }

                void launchFromChat();
              }}
              disabled={loading || launching || stopping || empty}
              title="Запуск. Shift+клик — с JSON input"
            >
              <Icon name="play" size={13} />
              <span className="play-label">Run</span>
            </button>
          )}
        </div>
      </header>
      {error ? <Banner>{error}</Banner> : null}
      <nav className="editor-tabs" aria-label="Разделы редактора">
        <button
          type="button"
          className={mobileTab === 'triggers' ? 'active' : ''}
          onClick={() => setMobileTab('triggers')}
        >
          Запуск
          {eventLive ? (
            <span className="tab-live" title="Бот работает">
              <span className="live-dot" />
            </span>
          ) : triggers.length ? (
            <span className="tab-count">{triggers.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={mobileTab === 'chat' ? 'active' : ''}
          onClick={() => setMobileTab('chat')}
        >
          Чат
        </button>
        <button
          type="button"
          className={mobileTab === 'flow' ? 'active' : ''}
          disabled={!showFlow}
          onClick={() => setMobileTab('flow')}
        >
          Схема
          {workflow.steps.length ? (
            <span className="tab-count">{workflow.steps.length}</span>
          ) : null}
        </button>
      </nav>
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
          {empty && triggers.length === 0 ? (
            <div className="editor-hero" />
          ) : null}
          <div className="composer-dock">
            <AskThread
              messages={mode === 'ask' ? askMessages : buildMessages}
              loading={
                (mode === 'ask' ? asking : planning) || launching || stopping
              }
              loadingLabel={
                stopping ? 'Останавливаю…' : launching ? 'Делаю…' : 'Думаю…'
              }
              hasMore={mode === 'ask' ? askHasMore : buildHasMore}
              loadingMore={mode === 'ask' ? askLoadingMore : buildLoadingMore}
              catalog={catalog}
              connections={connections}
              steps={workflow.steps}
              preferredTelegramKind={preferredTelegramKind}
              runs={runs}
              live={botLive}
              onLaunch={() => void launchFromChat()}
              onStop={() => void stopBot()}
              onBound={async (connectorId, connectionId) => {
                sessionBindings.current = {
                  ...sessionBindings.current,
                  [connectorId]: connectionId,
                };

                const current = workflowRef.current ?? workflow;
                const nextSteps = applySessionBindings(
                  current.steps.map((step) =>
                    step.connectorId === connectorId
                      ? { ...step, connectionId }
                      : step,
                  ),
                );

                replaceSteps(nextSteps, true);
                await persist(nextSteps);

                const next = await fetchConnections();

                setConnections(next);

                const mark = connectMark(connectorId);
                const target = (
                  mode === 'ask' ? askMessages : buildMessages
                )
                  .slice()
                  .reverse()
                  .find(
                    (item) =>
                      item.role === 'assistant' && item.content.includes(mark),
                  );
                const remaining = target
                  ? parseChatActions(target.content).connect.filter(
                      (id) => id !== connectorId,
                    )
                  : [];

                if (remaining.length && target) {
                  await settleThread('build', mark, {
                    rewrite: target.content
                      .split(mark)
                      .join('')
                      .replace(/\n{3,}/g, '\n\n')
                      .trim(),
                  });
                } else {
                  await settleThread('build', mark, {
                    content: connectedStatusMessage(
                      connectorId,
                      connectorTitle(connectorId),
                    ),
                  });
                }

                const missing = unresolvedConnectorIds(nextSteps, next);
                const lastUser = [...(mode === 'ask' ? askMessages : buildMessages)]
                  .reverse()
                  .find((item) => item.role === 'user');
                const liveAfterBind =
                  !missing.length &&
                  nextSteps.length > 0 &&
                  triggers.some(isLiveTrigger);

                if (
                  !missing.length &&
                  nextSteps.length &&
                  lastUser &&
                  isDoItTask(lastUser.content)
                ) {
                  await runOnceFromChat('Беру на себя.', next);
                  return;
                }

                if (liveAfterBind) {
                  await settleThread('build', LAUNCH_MARK, {
                    content: launchedStatusMessage(),
                  });
                  return;
                }

                if (!missing.length && nextSteps.length) {
                  await postAssistant(
                    'build',
                    `Готово, всё подключено. Можно запускать.\n${LAUNCH_MARK}`,
                  );
                }
              }}
              onCancelRun={(runId) => {
                if (eventLive) {
                  void cancelRun(runId)
                    .then((next) =>
                      setRuns((current) => ({ ...current, [runId]: next })),
                    )
                    .catch((err) =>
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Не удалось остановить',
                      ),
                    );
                  return;
                }

                void stopBot();
              }}
              onRetryRun={(runId) => {
                void retryRun(runId)
                  .then(async (created) => {
                    setRuns((current) => ({
                      ...current,
                      [created.id]: created,
                    }));
                    await postAssistant(
                      'build',
                      `Повторяю запуск.\n${runMark(created.id)}`,
                    );
                  })
                  .catch((err) =>
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Не удалось повторить',
                    ),
                  );
              }}
              onLoadOlder={loadOlderChat}
            />
            <PromptForm
              prompt={composerValue}
              loading={composerBusy}
              providers={agents}
              providerId={providerId}
              onPromptChange={changeComposer}
              onProviderChange={(id) => {
                setProviderId(id);

                try {
                  localStorage.setItem(AGENT_STORAGE_KEY, id);
                } catch {
                  /* ignore */
                }
              }}
              onSubmit={() => void handleComposer()}
              placeholder={
                buildFollowUp
                  ? 'Спросите или измените сценарий'
                  : 'Напишите задачу — сделаю сам'
              }
            />
          </div>
        </div>
        {showFlow ? (
          <section className="canvas-flow">
            <StepsEditor
              steps={workflow.steps}
              triggers={triggers}
              catalog={catalog}
              connections={connections}
            />
          </section>
        ) : null}
      </div>
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
            try {
              const input = JSON.parse(runInput || '{}') as Record<
                string,
                unknown
              >;

              void run(input);
            } catch {
              setError('Input должен быть JSON-объектом');
            }
          }}
        />
      ) : null}
      <ChatHistoryDrawer
        open={historyOpen}
        current={workflow}
        onClose={() => setHistoryOpen(false)}
        onLeave={() =>
          persist(workflowRef.current?.steps ?? workflow.steps)
        }
      />
    </div>
  );
};
