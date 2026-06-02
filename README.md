# Alpha Gym MVP (React + Express + SQLite)

## Run locally

### 1. Backend (port 3001)

```bash
cd backend
npm install
npm start
```

### 2. Frontend (port 5173)

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Demo login

| Role  | Email              | Password  |
|-------|--------------------|-----------|
| Admin | admin@alpha.local  | admin123  |
| Staff | staff@alpha.local  | staff123  |

## API

- `GET /members` — list members
- `POST /members` — create (`name`, `phone`, `expiry_date`, `weekly_sessions`)
- `PUT /members/:id` — update
- `DELETE /members/:id` — delete

Database file: `backend/gym.db`

Daily cron logs expired members to the backend console (09:00 Asia/Tehran).
