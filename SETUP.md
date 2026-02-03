# Agentic RAG Masterclass - Setup Guide

## Prerequisites

Before starting Module 1, you need to set up these external services:

### 1. Supabase (Required)
Database, authentication, and file storage.

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (name it something like "agentic-rag-masterclass")
3. Wait for the project to provision
4. Get your credentials from Project Settings > API:
   - **Project URL** (SUPABASE_URL)
   - **anon/public key** (SUPABASE_ANON_KEY) - use Legacy keys, not Publishable
   - **service_role secret** (SUPABASE_SERVICE_ROLE_KEY)

### 2. LangSmith (Required)
Observability for LLM calls - essential for debugging.

1. Go to [smith.langchain.com](https://smith.langchain.com) and create a free account
2. Go to Settings > API Keys
3. Create a new API key (LANGSMITH_API_KEY)
4. Create a project and note the project name (LANGSMITH_PROJECT)

### 3. OpenAI (Required for Module 1)
Used for managed RAG demo in Module 1. Optional after Module 2.

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key (OPENAI_API_KEY)
3. In the Playground > Storage, create a Vector Store
4. Note the Vector Store ID (OPENAI_VECTOR_STORE_ID)

### 4. OpenRouter (Optional - Alternative to OpenAI)
Access multiple models through one API. Useful from Module 2 onwards.

1. Go to [openrouter.ai](https://openrouter.ai)
2. Create an account and get an API key
3. Use base URL: `https://openrouter.ai/api/v1`

### 5. LM Studio (Optional - Local Models)
Run models locally without API costs.

1. Download from [lmstudio.ai](https://lmstudio.ai)
2. Download models like Qwen3-30B-A3B (mixture of experts)
3. Start local server (default: `http://localhost:1234/v1`)

### 6. Tavily (Required for Module 7)
Web search capability for the agent.

1. Go to [tavily.com](https://tavily.com)
2. Create account and get API key (TAVILY_API_KEY)

### 7. Cohere (Optional for Module 6)
Cloud reranking service. Alternative: use local reranking models.

1. Go to [cohere.com](https://cohere.com)
2. Create account and get API key

---

## Local Development Setup

### 1. Install Supabase CLI
```bash
# Windows (using scoop)
scoop install supabase

# Or download from: https://supabase.com/docs/guides/cli
```

### 2. Link Supabase Project
```bash
cd agentic-rag-masterclass
supabase login
supabase link --project-ref YOUR_PROJECT_ID
```

### 3. Python Environment (will be created in Module 1)
- Python 3.10+ required
- Virtual environment will be created in `backend/.venv`

### 4. Node.js (will be created in Module 1)
- Node.js 18+ required
- Dependencies will be installed in `frontend/node_modules`

---

## Environment Variables Template

Create `backend/.env` after Module 1 builds the backend folder:

```env
# Supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# LangSmith
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=agentic-rag-masterclass

# OpenAI (Module 1)
OPENAI_API_KEY=your_openai_key
OPENAI_VECTOR_STORE_ID=vs_xxxxx

# Tavily (Module 7)
TAVILY_API_KEY=your_tavily_key

# Text-to-SQL (Module 7)
SQL_READER_DATABASE_URL=postgresql://readonly_user:password@db.xxx.supabase.co:6543/postgres
```

---

## Getting Started

1. Open this folder in your IDE (Cursor, VS Code, etc.)
2. Open a terminal and run `claude` to start Claude Code
3. Run `/onboard` to orient Claude to the project
4. Enter plan mode (`Shift+Tab`) and say: "Let's kick off planning for Module 1"
5. Review and save the plan to `agent-plans/`
6. Clear session, then run `/build agent-plans/plan-01-module-01-app-shell.md`

Good luck with your build!
