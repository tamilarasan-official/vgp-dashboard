# VGP Unified Dashboard

| Folder | Stack | Port |
|---|---|---|
| `backend/` | NestJS 11 + Prisma 6 + PostgreSQL | 4000 (`/api`) |
| `frontend/` | Next.js 15 (App Router, Tailwind) | 3100 |

## Run locally
```bash
# backend
cd backend
cp .env.example .env        # fill DATABASE_URL (URL-encode @ as %40, # as %23)
npm install
npx prisma migrate deploy   # create/update tables
npx prisma db seed          # properties + source systems
npm run start:dev           # http://localhost:4000/api/health

# frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3100
```

## Database
- Foundation tables: `property`, `source_system`, `sync_run`.
- Each connector (FunSquare, Tally, Semnox, ...) adds its own tables in later migrations.
