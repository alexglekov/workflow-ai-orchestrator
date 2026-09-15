import { Injectable } from '@nestjs/common';
import { PrismaService } from '@ai-worker/data-access';

export type ChatThread = 'ask' | 'build';

export type ChatMessageInput = {
  role: 'user' | 'assistant';
  content: string;
  status?: 'error';
};

const KEEP = 80;
/** Обрезаем слишком длинные реплики, чтобы не раздувать контекст. */
const MAX_CONTENT = 20_000;

@Injectable()
export class WorkflowChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  listThread = (workflowId: string, thread: ChatThread) =>
    this.prisma.workflowChatMessage.findMany({
      where: { workflowId, thread },
      orderBy: { createdAt: 'asc' },
    });

  page = async (
    workflowId: string,
    thread: ChatThread,
    options: { before?: string; limit?: number } = {},
  ) => {
    const take = Math.min(50, Math.max(1, options.limit ?? 20));
    const cursorId = options.before?.trim();
    const cursor = cursorId
      ? await this.prisma.workflowChatMessage.findFirst({
          where: { id: cursorId, workflowId, thread },
          select: { id: true },
        })
      : null;
    const rows = await this.prisma.workflowChatMessage.findMany({
      where: { workflowId, thread },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const messages = (hasMore ? rows.slice(0, take) : rows)
      .reverse()
      .map((row) => ({
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        ...(row.status === 'error' ? { status: 'error' as const } : {}),
      }));

    return { messages, hasMore };
  };

  append = async (
    workflowId: string,
    thread: ChatThread,
    items: ChatMessageInput[],
  ) => {
    const rows = items
      .map((item) => ({
        workflowId,
        thread,
        role: item.role,
        content: item.content.trim().slice(0, MAX_CONTENT),
        status: item.status ?? null,
      }))
      .filter((item) => item.content);

    if (!rows.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workflowChatMessage.createMany({ data: rows });

      const extra = await tx.workflowChatMessage.findMany({
        where: { workflowId, thread },
        orderBy: { createdAt: 'desc' },
        skip: KEEP,
        select: { id: true },
      });

      if (extra.length) {
        await tx.workflowChatMessage.deleteMany({
          where: { id: { in: extra.map((item) => item.id) } },
        });
      }
    });
  };
}
