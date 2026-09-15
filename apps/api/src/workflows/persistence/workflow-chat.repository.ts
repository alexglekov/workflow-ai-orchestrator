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
      orderBy: [{ createdAt: 'asc' }, { role: 'desc' }, { id: 'asc' }],
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
      orderBy: [{ createdAt: 'desc' }, { role: 'asc' }, { id: 'desc' }],
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
      let at = Date.now();
      for (const row of rows) {
        await tx.workflowChatMessage.create({
          data: { ...row, createdAt: new Date(at) },
        });
        at += 1;
      }

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

  settle = async (
    workflowId: string,
    thread: ChatThread,
    match: string,
    options: { rewrite?: string; content?: string } = {},
  ) => {
    const needle = match.trim();

    if (!needle) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.workflowChatMessage.findMany({
        where: { workflowId, thread, role: 'assistant' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const hits = rows.filter((row) => row.content.includes(needle));
      const rewrite = options.rewrite?.trim().slice(0, MAX_CONTENT);

      if (rewrite) {
        const target = hits.at(-1);

        if (target) {
          await tx.workflowChatMessage.update({
            where: { id: target.id },
            data: { content: rewrite },
          });
        }
      } else if (hits.length) {
        await tx.workflowChatMessage.deleteMany({
          where: { id: { in: hits.map((row) => row.id) } },
        });
      }

      const content = options.content?.trim().slice(0, MAX_CONTENT);

      if (content) {
        await tx.workflowChatMessage.create({
          data: {
            workflowId,
            thread,
            role: 'assistant',
            content,
            status: null,
          },
        });
      }
    });
  };
}
