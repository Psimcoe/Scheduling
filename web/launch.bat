@echo off
cd /d "%~dp0"
echo === Installing dependencies ===
call pnpm install
echo === Generating Prisma client ===
call pnpm --filter @schedulesync/backend exec prisma generate
echo === Pushing database ===
call pnpm --filter @schedulesync/backend exec prisma db push
echo === Building all packages ===
call pnpm build
echo === Starting dev servers ===
call pnpm dev
