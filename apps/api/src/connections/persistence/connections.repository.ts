import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';

@Injectable()
export class ConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll = () =>
    this.prisma.connection.findMany({
      orderBy: { createdAt: 'asc' },
    });

  findById = (id: string) =>
    this.prisma.connection.findUnique({ where: { id } });

  findLatestByConnector = (connectorId: string) =>
    this.prisma.connection.findFirst({
      where: { connectorId },
      orderBy: { updatedAt: 'desc' },
    });

  findByConnector = (connectorId: string) =>
    this.prisma.connection.findMany({
      where: { connectorId },
      orderBy: { createdAt: 'asc' },
    });

  create = (data: {
    connectorId: string;
    name: string;
    credentialsEnc: string;
  }) =>
    this.prisma.connection.create({
      data: {
        connectorId: data.connectorId,
        name: data.name,
        credentialsEnc: data.credentialsEnc,
        status: 'disconnected',
      },
    });

  update = (id: string, data: Prisma.ConnectionUpdateInput) =>
    this.prisma.connection.update({ where: { id }, data });

  delete = (id: string) => this.prisma.connection.delete({ where: { id } });
}
