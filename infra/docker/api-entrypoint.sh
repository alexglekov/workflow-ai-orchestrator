#!/bin/sh
set -eu

npx prisma migrate deploy --schema=libs/data-access/prisma/schema.prisma
exec node dist/apps/api/main.js
