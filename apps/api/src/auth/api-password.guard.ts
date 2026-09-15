import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

const publicPath = (path: string) => {
  const normalized = path.split('?')[0].replace(/\/+$/, '') || '/';

  return (
    normalized === '/health' ||
    normalized === '/api/health' ||
    normalized === '/auth/status' ||
    normalized === '/api/auth/status' ||
    /\/hooks\/[^/]+$/.test(normalized)
  );
};

const tokenFrom = (request: Request): string => {
  const apiKey = request.headers['x-api-key'];
  const authorization = request.headers.authorization;

  if (typeof apiKey === 'string' && apiKey.trim()) {
    return apiKey.trim();
  }

  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  return '';
};

@Injectable()
export class ApiPasswordGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.API_PASSWORD?.trim();

    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (request.method === 'OPTIONS' || publicPath(request.path || request.url)) {
      return true;
    }

    if (tokenFrom(request) === expected) {
      return true;
    }

    throw new UnauthorizedException('Нужен пароль API');
  }
}
