import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AgentMessage } from '~/entities/agent';
import type { Connection } from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import type { Run } from '~/entities/run';
import type { WorkflowStep } from '~/entities/workflow';
import {
  connectorTitle,
  parseChatActions,
  unresolvedConnectorIds,
} from '~/shared/lib/chat-actions';
import { ChatConnectPanel } from './ChatConnectPanel';
import { ChatRunCard } from './ChatRunCard';

export const AskThread = ({
  messages,
  loading,
  loadingLabel = 'Думаю…',
  hasMore = false,
  loadingMore = false,
  catalog = [],
  connections = [],
  steps = [],
  runs = {},
  live = false,
  onLoadOlder,
  onLaunch,
  onStop,
  onBound,
  onCancelRun,
  onRetryRun,
}: {
  messages: AgentMessage[];
  loading: boolean;
  loadingLabel?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  catalog?: ConnectorCatalog[];
  connections?: Connection[];
  steps?: WorkflowStep[];
  runs?: Record<string, Run>;
  live?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  onLaunch?: () => void;
  onStop?: () => void;
  onBound?: (connectorId: string, connectionId: string) => void | Promise<void>;
  onCancelRun?: (runId: string) => void;
  onRetryRun?: (runId: string) => void;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prevFirstId = useRef<string | undefined>(undefined);
  const prevHeight = useRef(0);
  const seenKeys = useRef(new Set<string>());
  const primed = useRef(false);
  const enterFirstId = useRef<string | undefined>(undefined);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  const [openConnect, setOpenConnect] = useState<string | null>(null);
  const empty = messages.length === 0 && !loading;

  const messageKey = (item: AgentMessage, index: number) =>
    item.id || `${item.role}:${index}:${item.content}`;

  const noteBottom = () => {
    const node = scroller.current;

    if (!node) {
      return;
    }

    nearBottom.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  };

  useLayoutEffect(() => {
    const node = scroller.current;

    if (!node || empty) {
      return;
    }

    const firstId = messages.find((item) => item.id)?.id;
    const prepended = Boolean(
      prevFirstId.current && firstId && firstId !== prevFirstId.current,
    );

    if (prepended) {
      node.scrollTop += node.scrollHeight - prevHeight.current;
    } else if (nearBottom.current) {
      node.scrollTop = node.scrollHeight;
    }

    prevFirstId.current = firstId;
    prevHeight.current = node.scrollHeight;
  }, [empty, messages, loading, loadingMore, openConnect, runs]);

  useLayoutEffect(() => {
    const keys = messages.map((item, index) => messageKey(item, index));
    const firstId = messages.find((item) => item.id)?.id;
    const prepended = Boolean(
      enterFirstId.current && firstId && firstId !== enterFirstId.current,
    );

    enterFirstId.current = firstId;

    if (!primed.current) {
      primed.current = true;
      keys.forEach((key) => seenKeys.current.add(key));
      return;
    }

    if (prepended) {
      keys.forEach((key) => seenKeys.current.add(key));
      return;
    }

    const added: string[] = [];

    for (const key of keys) {
      if (!seenKeys.current.has(key)) {
        seenKeys.current.add(key);
        added.push(key);
      }
    }

    if (!added.length) {
      return;
    }

    setFreshKeys((current) => {
      const next = new Set(current);

      added.forEach((key) => next.add(key));

      return next;
    });
  }, [messages]);

  useEffect(() => {
    const root = scroller.current;
    const target = sentinel.current;

    if (!root || !target || !hasMore || loadingMore || !onLoadOlder) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadOlder();
        }
      },
      { root, rootMargin: '120px 0px 0px' },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadOlder, messages.length]);

  useEffect(() => {
    const node = scroller.current;

    if (!node || empty || !hasMore || loadingMore || !onLoadOlder) {
      return;
    }

    if (node.scrollHeight <= node.clientHeight + 8) {
      onLoadOlder();
    }
  }, [empty, messages.length, hasMore, loadingMore, onLoadOlder]);

  if (empty) {
    return null;
  }

  return (
    <div className="ask-thread" ref={scroller} onScroll={noteBottom}>
      {hasMore ? (
        <div className="ask-thread-more" ref={sentinel}>
          {loadingMore ? 'Загружаю переписку…' : 'Ещё сообщения'}
        </div>
      ) : null}
      {messages.map((item, index) => {
        const parsed = parseChatActions(item.content);
        const bubbleKey = item.id || `${item.role}-${index}`;
        const enterKey = messageKey(item, index);
        const run = parsed.runId ? runs[parsed.runId] : undefined;
        const launched =
          parsed.status === 'launched' || (Boolean(parsed.launch) && live);
        const showLaunch =
          item.role === 'assistant' &&
          parsed.launch &&
          onLaunch &&
          !live &&
          parsed.status !== 'launched';
        const displayText =
          launched && parsed.status !== 'launched' && parsed.launch
            ? ''
            : launched && /^запущено\.?$/i.test(parsed.text)
              ? ''
              : parsed.status === 'stopped' &&
                  /^остановлено\.?$/i.test(parsed.text)
                ? ''
                : parsed.text;

        return (
          <div
            key={bubbleKey}
            className={[
              item.role === 'user' ? 'user-bubble' : 'ask-bubble',
              item.status === 'error' ? 'error' : '',
              launched ? 'is-live' : '',
              freshKeys.has(enterKey) ? 'is-enter' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {displayText}
            {item.role === 'assistant' && parsed.status === 'connected' ? (
              <span className="chat-live-chip is-ok">Подключено</span>
            ) : null}
            {item.role === 'assistant' && parsed.status === 'stopped' ? (
              <span className="chat-live-chip is-off">Остановлено</span>
            ) : null}
            {item.role === 'assistant' && launched ? (
              <div className="chat-status-row">
                <span className="chat-live-chip">
                  <span className="live-dot" />
                  Запущено
                </span>
                {live && onStop ? (
                  <button
                    type="button"
                    className="telegram-connect-btn stop"
                    onClick={onStop}
                  >
                    Остановить
                  </button>
                ) : null}
              </div>
            ) : null}
            {item.role === 'assistant' && parsed.connect.length ? (
              <div className="chat-actions">
                {parsed.connect.map((connectorId) => {
                  const connector = catalog.find((entry) => entry.id === connectorId);
                  const unresolved = unresolvedConnectorIds(steps, connections);
                  const bound = steps.find(
                    (step) =>
                      step.connectorId === connectorId && step.connectionId,
                  );
                  const boundConnection = connections.find(
                    (entry) => entry.id === bound?.connectionId,
                  );
                  const panelKey = `${bubbleKey}:${connectorId}`;
                  const existing = connections.filter(
                    (entry) =>
                      entry.connectorId === connectorId &&
                      entry.status === 'connected',
                  );

                  if (!unresolved.includes(connectorId) && boundConnection) {
                    return (
                      <p key={connectorId} className="muted">
                        Для этого чата выбран {boundConnection.name}
                      </p>
                    );
                  }

                  return (
                    <div key={connectorId} className="chat-action-block">
                      <button
                        type="button"
                        className="telegram-connect-btn"
                        onClick={() =>
                          setOpenConnect((current) =>
                            current === panelKey ? null : panelKey,
                          )
                        }
                      >
                        {existing.length
                          ? `Выбрать ${connectorTitle(connectorId, connector?.name)}`
                          : `Подключить ${connectorTitle(connectorId, connector?.name)}`}
                      </button>
                      {openConnect === panelKey && connector ? (
                        <ChatConnectPanel
                          connector={connector}
                          connections={connections}
                          onConnected={async (connectionId) => {
                            await onBound?.(connectorId, connectionId);
                            setOpenConnect(null);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {showLaunch ? (
              <button
                type="button"
                className="telegram-connect-btn launch"
                onClick={onLaunch}
              >
                Запустить
              </button>
            ) : null}
            {run ? (
              <ChatRunCard
                run={run}
                onCancel={
                  onCancelRun ? () => onCancelRun(run.id) : undefined
                }
                onRetry={onRetryRun ? () => onRetryRun(run.id) : undefined}
              />
            ) : parsed.runId ? (
              <p className="muted">Загрузка запуска…</p>
            ) : null}
          </div>
        );
      })}
      {loading ? (
        <div className="thinking is-enter">
          <span className="thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {loadingLabel}
        </div>
      ) : null}
    </div>
  );
};
