# Agentic RAG Application - Product Requirements Document

## Overview
An agentic RAG (Retrieval Augmented Generation) application with two primary interfaces:
1. **Chat Interface** - Conversational AI with tool use, sub-agents, and streaming
2. **Document Ingestion Interface** - Upload and process documents into vector store

## Tech Stack
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui + Vite
- **Backend**: Python + FastAPI
- **Database**: Supabase (PostgreSQL + pgvector + Auth + Storage)
- **Document Parsing**: Docling
- **Observability**: LangSmith

## In Scope
- Multi-user authentication with data isolation (RLS)
- Document upload and processing pipeline
- Vector search with embeddings
- Hybrid search (semantic + keyword)
- Reranking capabilities
- Web search tool
- Text-to-SQL tool for structured data
- Sub-agent architecture for document analysis
- Real-time UI updates
- Dark mode

## Out of Scope (for this version)
- Production deployment
- Code execution sandbox
- Graph RAG / knowledge graphs
- Voice interface

---

## Module 1: App Shell
**Goal**: Foundation with auth, basic chat, and managed RAG demo

### Features
- Supabase authentication (login/logout)
- Chat interface with threads
- Message streaming
- OpenAI Responses API integration (managed RAG demo)
- LangSmith tracing setup
- Basic database schema (users, threads, messages)

### Acceptance Criteria
- [ ] User can sign up and log in
- [ ] User can create chat threads
- [ ] Messages stream in real-time
- [ ] Chat history persists across sessions
- [ ] LangSmith shows traces for all LLM calls
- [ ] Different users see only their own data

---

## Module 2: Bring Your Own Retrieval
**Goal**: Replace managed RAG with custom ingestion and retrieval

### Features
- Document upload UI (drag & drop)
- File storage in Supabase buckets
- Text extraction and chunking
- Embedding generation (configurable provider)
- pgvector storage for embeddings
- Settings UI for LLM/embedding configuration
- Real-time ingestion status

### Acceptance Criteria
- [ ] User can upload text/markdown files
- [ ] Documents are chunked and embedded
- [ ] Embeddings stored in pgvector
- [ ] Chat uses custom vector search
- [ ] Settings allow changing LLM provider
- [ ] Ingestion shows real-time progress

---

## Module 3: Record Manager
**Goal**: Prevent duplicate documents and enable incremental updates

### Features
- Content hashing for deduplication
- Skip processing for identical content
- Delete old chunks when document updated
- Cascade delete (document -> chunks -> embeddings)

### Acceptance Criteria
- [ ] Uploading same file twice shows "unchanged" status
- [ ] Modified files trigger re-processing
- [ ] Deleting document removes all related chunks
- [ ] No orphan chunks in database

---

## Module 4: Metadata Extraction & Filtering
**Goal**: Extract structured metadata to improve retrieval precision

### Features
- LLM-based metadata extraction during ingestion
- Configurable metadata schema (stored in settings)
- Metadata fields: title, summary, document_type, topics, language
- Metadata filtering in vector search
- Expandable detail panel per document

### Acceptance Criteria
- [ ] Documents show extracted metadata after processing
- [ ] Admin can configure metadata schema
- [ ] Search can filter by metadata fields
- [ ] Metadata propagates to chunks

---

## Module 5: Multi-format Support
**Goal**: Support PDF and other document formats via Docling

### Features
- Docling integration for document parsing
- Support: PDF, DOCX, PPTX, HTML, images
- Standard pipeline (fast, CPU-based)
- Optional VLM pipeline for complex layouts

### Acceptance Criteria
- [ ] PDF files upload and process correctly
- [ ] Text extracted preserves structure
- [ ] Large files don't crash the server
- [ ] Batch processing with concurrency limits

---

## Module 6: Hybrid Search & Reranking
**Goal**: Improve retrieval quality with multiple search strategies

### Features
- Keyword search (full-text search in Postgres)
- Semantic search (vector similarity)
- Hybrid mode (combine both with RRF)
- Reranking with Cohere or local model
- Configurable search mode and reranker

### Acceptance Criteria
- [ ] Search mode selectable (vector/keyword/hybrid)
- [ ] Reranking improves result relevance
- [ ] Settings allow reranker configuration
- [ ] LangSmith traces show search scores

---

## Module 7: Additional Tools
**Goal**: Expand agent capabilities beyond document search

### Features
- **Web Search**: Tavily integration for real-time information
- **Text-to-SQL**: Query structured data in Supabase
  - Dedicated read-only database user
  - Database-level security (no destructive queries)
  - Sales data table for demo

### Acceptance Criteria
- [ ] Agent can search the web when documents insufficient
- [ ] Agent can query sales_data table with SQL
- [ ] SQL injection prevented at database level
- [ ] Tool calls visible in chat UI

---

## Module 8: Sub-Agents
**Goal**: Delegate full-document analysis to specialized sub-agents

### Features
- Analyze Document tool
- Sub-agent loads entire document into context
- Streaming reasoning visible to user
- Isolated message context per sub-agent
- Nested tool calls rendered in UI

### Acceptance Criteria
- [ ] "Summarize this document" triggers sub-agent
- [ ] Sub-agent thinking process visible
- [ ] Main agent context not polluted
- [ ] Tool call history persists in database
- [ ] Multiple think tags render correctly
