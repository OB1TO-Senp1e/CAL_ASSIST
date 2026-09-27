# CalAssist - Technical Blueprint Summary

## Project Structure
```
CAL_ASSIST/
├── prisma/schema.prisma     # Database schema with core entities
├── src/
│   ├── core/                # Context, Memory, Orchestrator engines
│   ├── ai/                  # Intent Parser, Planning, Suggestions
│   ├── scheduling/          # Scheduling, Time Compiler, Reality, Replanning
│   ├── domains/             # Goal, Commitment, Task, Project engines
│   ├── integrations/        # Calendar, AI, Notification providers
│   ├── infrastructure/      # Auth, Permissions, Audit
│   └─ interfaces/           # API, WebSocket, CLI
├── package.json
├── tsconfig.json
└── .env
```

## Key Architectural Decisions

### Engine Layer Cake
1. **Context Engine** - Assembles unified context
2. **Memory Engine** - Long-term memory management
3. **Assistant Orchestrator** - Coordinates all engines
4. **Intent Parser** - NLU processing
5. **Planning Engine** - Goal decomposition
6. **Scheduling Engine** - Time optimization
7. **Time Compiler** - Schedule compilation
8. **Reality Engine** - Execution monitoring
9. **Replanning Engine** - Dynamic replanning

### Data Architecture
- **Transactional**: PostgreSQL (Prisma ORM)
- **Vector**: ChromaDB/Pinecone (future)
- **Cache**: Redis (future)
- **Queue**: RabbitMQ/NATS (future)

### Key Interfaces
- Calendar Provider Interface (pluggable adapters)
- AI Provider Interface (abstract LLM access)
- Notification Service (email/SMS/push)
- Permission System (granular autonomy controls)

## Next Steps
Phase 1 Implementation: Foundation
- Set up NestJS application
- Implement auth module
- Create core entity services
- Build API endpoints

Last Updated: 2026-09-25
