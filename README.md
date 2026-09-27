# CalAssist - AI-Powered Personal Time Operating System

## Overview

CalAssist is not a calendar application — it's an AI-powered Personal Time Operating System that manages the full lifecycle of your time:

**Intent → Planning → Scheduling → Execution → Reality Detection → Replanning → Learning**

## Architecture

### Core Engines
- **Context Engine**: Assembles unified context from all data sources
- **Memory Engine**: Long-term memory management with embeddings
- **Assistant Orchestrator**: Coordinates all components

### AI Engines
- **Intent Parser**: Natural language understanding
- **Planning Engine**: Goal decomposition into tasks
- **Scheduling Engine**: Time optimization and conflict detection
- **Reality Engine**: Execution monitoring and anomaly detection
- **Replanning Engine**: Dynamic schedule adjustment

### Domain Engines
- **Goal Engine**: Goal lifecycle management
- **Commitment Engine**: External commitment tracking
- **Project Engine**: Project decomposition
- **Task Engine**: Task management with dependencies

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- npm/yarn

### Installation

1. Clone and install dependencies:
```bash
cd CAL_ASSIST
npm install --legacy-peer-deps
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Generate Prisma client:
```bash
npx prisma generate
```

4. Run migrations:
```bash
npx prisma migrate dev --name init
```

### Development

Start the development server:
```bash
npm run start:dev
```

Run tests:
```bash
npm test
npm run test:coverage
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT

### Goals
- `POST /goals` - Create goal
- `GET /goals` - List goals
- `GET /goals/:id` - Get goal details
- `GET /goals/:id/progress` - Get progress
- `PATCH /goals/:id` - Update goal
- `DELETE /goals/:id` - Delete goal

### Tasks
- `POST /tasks` - Create task
- `GET /tasks` - List tasks
- `GET /tasks/:id` - Get task details
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Events
- `POST /events` - Create event
- `GET /events` - List events
- `PATCH /events/:id` - Update event
- `DELETE /events/:id` - Delete event

### AI Integration
- `POST /ai/intent/parse` - Parse natural language intent
- `POST /ai/planning/from-intent` - Create plan from intent
- `POST /scheduling/generate` - Generate schedule

### Core Engines
- `GET /context/user` - Get user context
- `POST /memory` - Store memory
- `GET /reality/check` - Run reality check
- `POST /replanning/trigger` - Trigger replanning

## Key Design Principles

1. **Strong Typing**: Zod validation on all inputs
2. **Permission System**: Explicit autonomy controls
3. **Explainability**: Every AI action logged with reasoning
4. **Extensibility**: Pluggable providers for AI, Calendar, Notifications
5. **Production Quality**: Full test coverage, type safety, validation

## Project Structure

```
src/
├── core/                   # Core engines (Context, Memory, Orchestrator)
│   ├── context-engine/
│   └── memory-engine/
├── ai/                     # AI components
│   ├── intent/             # Intent parsing
│   └── planning/           # Planning engine
├── scheduling/             # Scheduling system
│   ├── scheduling-engine/  # Schedule optimization
│   ├── reality-engine/     # Execution monitoring
│   └── replanning-engine/  # Dynamic replanning
├── domains/                # Domain engines
│   ├── goal-engine/
│   └── commitment-engine/
├── integrations/           # External integrations
│   ├── ai-providers/       # OpenAI, Ollama adapters
│   ├── calendar-adapters/  # Calendar sync (planned)
│   └── notification-service/ # Notifications (planned)
├── infrastructure/         # Auth, permissions, audit
├── auth/
├── goals/
├── projects/
├── tasks/
├── events/
├── time-blocks/
└── commitments/
```

## License

MIT
