import { useEffect, useRef } from 'react';
import type { AgentMessage } from '~/entities/agent';

export const AskThread = ({
  messages,
  loading,
}: {
  messages: AgentMessage[];
  loading: boolean;
}) => {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;

    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="ask-thread" ref={scroller}>
      {messages.map((item, index) => (
        <div
          key={`${item.role}-${index}`}
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
