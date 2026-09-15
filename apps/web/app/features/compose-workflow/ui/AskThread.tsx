import { useEffect, useLayoutEffect, useRef } from 'react';
import type { AgentMessage } from '~/entities/agent';

export const AskThread = ({
  messages,
  loading,
  hasMore = false,
  loadingMore = false,
  onLoadOlder,
}: {
  messages: AgentMessage[];
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadOlder?: () => void | Promise<void>;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prevFirstId = useRef<string | undefined>(undefined);
  const prevHeight = useRef(0);
  const empty = messages.length === 0 && !loading;

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
  }, [empty, messages, loading, loadingMore]);

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
      {messages.map((item, index) => (
        <div
          key={item.id || `${item.role}-${index}`}
          className={
            item.role === 'user'
              ? 'user-bubble'
              : item.status === 'error'
                ? 'ask-bubble error'
                : 'ask-bubble'
          }
        >
          {item.content}
        </div>
      ))}
      {loading ? (
        <div className="thinking">
          <span className="thinking-dot" />
          Думаю…
        </div>
      ) : null}
    </div>
  );
};
