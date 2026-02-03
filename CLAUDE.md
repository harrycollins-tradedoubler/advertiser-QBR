# Agentic RAG Masterclass - Claude Code Configuration

## Project Overview
Building an Agentic RAG application with:
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui (bundled with Vite)
- **Backend**: Python + FastAPI + Docling (document parsing)
- **Database**: Supabase (PostgreSQL + pgvector + file storage + auth)
- **Observability**: LangSmith for LLM tracing

## Tech Stack Rules
- Use raw SDK calls - no frameworks like LangChain or LlamaIndex
- All users must only see their own data (Row Level Security in Supabase)
- Support both cloud models (OpenAI, OpenRouter) and local models (LM Studio)
- Use modern OpenAI Responses API (not legacy Assistants API)

## Development Flow
1. **Plan** - Use plan mode for each module, save plans to `agent-plans/` folder
2. **Build** - Execute plans using `/build` command with sub-agents where possible
3. **Validate** - Run automated tests + manual smoke tests
4. **Iterate** - Fix bugs, then commit when module is complete

## Plan File Convention
Save all plans to: `agent-plans/plan-{number}-module-{number}-{short-description}.md`

Example: `agent-plans/plan-01-module-01-app-shell.md`

Plans should include:
- Complexity assessment (low/medium/high)
- Task breakdown with sequencing
- Parallel execution opportunities
- Acceptance criteria

## Progress Tracking
Always update `progress.md` after completing tasks. Use statuses:
- `not started`
- `in progress`
- `completed`

## Supabase Configuration
- This is a REMOTE Supabase instance (not local Docker)
- Supabase CLI is installed for migrations
- To run migrations: `supabase db push` (after linking project)
- Always enable RLS on tables containing user data

## Services Startup
To start all services, run: `scripts/start-services.ps1`
To restart: `scripts/restart-services.ps1`

Backend runs on: http://localhost:8000
Frontend runs on: http://localhost:5173

## Test Credentials
For testing multi-user isolation:
- User 1: test@test.com / [set password in Supabase Auth]
- User 2: test2@test.com / [set password in Supabase Auth]

## Context Management
- Monitor context window usage (aim to stay under 50%)
- Clear sessions with `/clear` when approaching limits
- Use `/onboard` command to quickly bring new agents up to speed
- Commit frequently to enable easy rollback

## Environment Variables
Backend `.env` requires:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- OPENAI_API_KEY (for Module 1, optional later)
- LANGSMITH_API_KEY
- LANGSMITH_PROJECT
- OPENAI_VECTOR_STORE_ID (for managed RAG in Module 1)
- TAVILY_API_KEY (for web search in Module 7)
- SQL_READER_DATABASE_URL (for text-to-SQL in Module 7)

## Validation Test Suite
When building new features, update the test suite in `tests/` folder.
Run validation with: `python -m pytest tests/`
