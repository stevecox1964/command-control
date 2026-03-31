from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import anthropic
import httpx
import openai

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DB_PATH = PROJECT_ROOT / 'backend' / 'memory.db'
MEMORY_DIR = WORKSPACE_ROOT / 'memory'
LONG_TERM_MEMORY_PATH = WORKSPACE_ROOT / 'MEMORY.md'

DocumentType = Literal['daily', 'long_term']
TaskType = Literal['web_fetch', 'script', 'agent_job', 'coding', 'review', 'reminder', 'check', 'transform', 'notification', 'approval', 'custom']
OwnerType = Literal['user', 'bot', 'system']
AgentSelectionMode = Literal['fixed', 'pool', 'auto']
ModelProfile = Literal['token_light', 'balanced', 'coding_heavy', 'high_reasoning', 'premium']
ReasoningLevel = Literal['low', 'medium', 'high']
BudgetPolicy = Literal['cheap', 'balanced', 'premium']
QueueItemStatus = Literal['queued', 'running', 'blocked', 'waiting_for_dependency', 'completed', 'failed', 'cancelled']
TriggerSource = Literal['manual', 'schedule', 'event', 'dependency', 'workflow']
ExecutionBackend = Literal['openclaw', 'wrapper', 'hybrid']


class MemoryDocument(BaseModel):
    id: int
    title: str
    doc_type: DocumentType
    source_path: str
    date_label: str | None
    word_count: int
    char_count: int
    updated_at: str
    summary: str
    content: str


class MemoryListItem(BaseModel):
    id: int
    title: str
    doc_type: DocumentType
    source_path: str
    date_label: str | None
    word_count: int
    char_count: int
    updated_at: str
    summary: str


class IngestResponse(BaseModel):
    ingested: int
    skipped: int
    total: int


class RetryPolicy(BaseModel):
    max_retries: int = 2
    retry_delay_seconds: int = 30


class WorkflowStep(BaseModel):
    step_id: str
    task_definition_id: str
    name: str
    on_success: str = 'complete'
    on_failure: str = 'fail_workflow'
    conditions: list = Field(default_factory=list)


class TaskDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    task_type: TaskType
    owner_type: OwnerType = 'user'
    trigger_modes: list[str] = Field(default_factory=lambda: ['manual'])
    enabled: bool = True
    config: dict = Field(default_factory=dict)
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    execution_backend: ExecutionBackend = 'openclaw'
    assigned_agent_id: str | None = None
    allowed_agent_ids: list[str] = Field(default_factory=list)
    agent_selection_mode: AgentSelectionMode = 'auto'
    required_capabilities: list[str] = Field(default_factory=list)
    model_profile: ModelProfile = 'balanced'
    max_tokens: int | None = None
    reasoning_level: ReasoningLevel = 'medium'
    budget_policy: BudgetPolicy = 'balanced'
    priority: int = Field(default=5, ge=1, le=10)
    timeout_seconds: int = 300
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    tags: list[str] = Field(default_factory=list)
    created_by: str = 'user'


class TaskDefinitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    task_type: TaskType | None = None
    owner_type: OwnerType | None = None
    trigger_modes: list[str] | None = None
    enabled: bool | None = None
    config: dict | None = None
    execution_backend: ExecutionBackend | None = None
    assigned_agent_id: str | None = None
    allowed_agent_ids: list[str] | None = None
    agent_selection_mode: AgentSelectionMode | None = None
    required_capabilities: list[str] | None = None
    model_profile: ModelProfile | None = None
    max_tokens: int | None = None
    reasoning_level: ReasoningLevel | None = None
    budget_policy: BudgetPolicy | None = None
    priority: int | None = Field(default=None, ge=1, le=10)
    timeout_seconds: int | None = None
    retry_policy: RetryPolicy | None = None
    tags: list[str] | None = None


class TaskDefinitionRecord(TaskDefinitionCreate):
    id: str
    created_at: str
    updated_at: str


class WorkflowDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    enabled: bool = True
    trigger_modes: list[str] = Field(default_factory=lambda: ['manual'])
    schedule: str | None = None
    steps: list[WorkflowStep] = Field(default_factory=list)
    error_policy: dict = Field(default_factory=dict)
    created_by: str = 'user'


class WorkflowDefinitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    enabled: bool | None = None
    trigger_modes: list[str] | None = None
    schedule: str | None = None
    steps: list[WorkflowStep] | None = None
    error_policy: dict | None = None


class WorkflowDefinitionRecord(WorkflowDefinitionCreate):
    id: str
    created_at: str
    updated_at: str


class QueueItemRecord(BaseModel):
    id: str
    queue_item_type: str
    source_type: str
    source_definition_id: str
    workflow_run_id: str | None
    parent_queue_item_id: str | None
    status: str
    assigned_agent_id: str | None
    allowed_agent_ids: list[str]
    agent_selection_mode: str
    required_capabilities: list[str]
    model_profile: str
    priority: int
    payload: dict
    retry_count: int
    max_retries: int
    timeout_seconds: int
    created_by: str
    created_at: str
    started_at: str | None
    completed_at: str | None
    result_summary: str | None
    error_message: str | None


class TaskRunRecord(BaseModel):
    id: str
    task_definition_id: str
    queue_item_id: str
    workflow_run_id: str | None
    trigger_source: str
    input_payload: dict
    output_payload: dict
    status: str
    agent_id: str | None
    model_profile: str | None
    started_at: str | None
    completed_at: str | None
    result_summary: str | None
    error_message: str | None


class WorkflowRunRecord(BaseModel):
    id: str
    workflow_definition_id: str
    queue_item_id: str
    trigger_source: str
    input_payload: dict
    status: str
    current_step: str | None
    started_at: str | None
    completed_at: str | None
    result_summary: str | None
    error_message: str | None


class ClaimRequest(BaseModel):
    agent_id: str


class CompleteRequest(BaseModel):
    result_summary: str | None = None
    output_payload: dict = Field(default_factory=dict)


class FailRequest(BaseModel):
    error_message: str


class OpenClawCommandResult(BaseModel):
    ok: bool
    command: list[str]
    stdout: str
    stderr: str
    returncode: int


class OpenClawStatusPayload(BaseModel):
    summary: str
    health: dict
    sessions: dict
    gateway: str


class OpenClawLogPayload(BaseModel):
    lines: list[str]


class AgentProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    purpose: str | None = None
    status: str = 'planned'
    preferred_model: str | None = None
    notes: str | None = None
    capability: str | None = None


class AgentProfileCreate(AgentProfileBase):
    pass


class AgentProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, min_length=1, max_length=200)
    purpose: str | None = None
    status: str | None = None
    preferred_model: str | None = None
    notes: str | None = None
    capability: str | None = None


class AgentProfileRecord(AgentProfileBase):
    id: int
    created_at: str
    updated_at: str


class ChatMessageRecord(BaseModel):
    id: int
    profile_id: int
    role: str
    content: str
    created_at: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=32000)


@dataclass
class SourceFile:
    path: Path
    doc_type: DocumentType


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def title_for_file(path: Path, doc_type: DocumentType) -> str:
    if doc_type == 'long_term':
        return 'Long-Term Memory'
    return f'Journal: {path.stem}'


def summary_for_content(text: str) -> str:
    lines = [line.strip('- ').strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return 'Empty memory file.'
    return lines[1] if len(lines) > 1 else lines[0]


def hash_content(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def word_count(text: str) -> int:
    return len(text.split())


def collect_sources() -> list[SourceFile]:
    sources: list[SourceFile] = []
    if MEMORY_DIR.exists():
        for path in sorted(MEMORY_DIR.glob('*.md')):
            sources.append(SourceFile(path=path, doc_type='daily'))
    if LONG_TERM_MEMORY_PATH.exists():
        sources.append(SourceFile(path=LONG_TERM_MEMORY_PATH, doc_type='long_term'))
    return sources


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as conn:
        conn.executescript(
            '''
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS memory_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_path TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                doc_type TEXT NOT NULL,
                date_label TEXT,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                summary TEXT NOT NULL,
                word_count INTEGER NOT NULL,
                char_count INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                ingested_at TEXT NOT NULL
            );

            DROP TABLE IF EXISTS tasks;
            DROP TABLE IF EXISTS task_runs;

            CREATE TABLE IF NOT EXISTS task_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                task_type TEXT NOT NULL,
                owner_type TEXT NOT NULL DEFAULT 'user',
                trigger_modes TEXT NOT NULL DEFAULT '["manual"]',
                enabled INTEGER NOT NULL DEFAULT 1,
                config TEXT NOT NULL DEFAULT '{}',
                input_schema TEXT NOT NULL DEFAULT '{}',
                output_schema TEXT NOT NULL DEFAULT '{}',
                execution_backend TEXT NOT NULL DEFAULT 'openclaw',
                assigned_agent_id TEXT,
                allowed_agent_ids TEXT NOT NULL DEFAULT '[]',
                agent_selection_mode TEXT NOT NULL DEFAULT 'auto',
                required_capabilities TEXT NOT NULL DEFAULT '[]',
                model_profile TEXT NOT NULL DEFAULT 'balanced',
                max_tokens INTEGER,
                reasoning_level TEXT NOT NULL DEFAULT 'medium',
                budget_policy TEXT NOT NULL DEFAULT 'balanced',
                priority INTEGER NOT NULL DEFAULT 5,
                timeout_seconds INTEGER NOT NULL DEFAULT 300,
                retry_policy TEXT NOT NULL DEFAULT '{"max_retries": 2, "retry_delay_seconds": 30}',
                tags TEXT NOT NULL DEFAULT '[]',
                created_by TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workflow_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                trigger_modes TEXT NOT NULL DEFAULT '["manual"]',
                schedule TEXT,
                steps TEXT NOT NULL DEFAULT '[]',
                error_policy TEXT NOT NULL DEFAULT '{}',
                created_by TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS queue_items (
                id TEXT PRIMARY KEY,
                queue_item_type TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_definition_id TEXT NOT NULL,
                workflow_run_id TEXT,
                parent_queue_item_id TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                assigned_agent_id TEXT,
                allowed_agent_ids TEXT NOT NULL DEFAULT '[]',
                agent_selection_mode TEXT NOT NULL DEFAULT 'auto',
                required_capabilities TEXT NOT NULL DEFAULT '[]',
                model_profile TEXT NOT NULL DEFAULT 'balanced',
                priority INTEGER NOT NULL DEFAULT 5,
                payload TEXT NOT NULL DEFAULT '{}',
                retry_count INTEGER NOT NULL DEFAULT 0,
                max_retries INTEGER NOT NULL DEFAULT 2,
                timeout_seconds INTEGER NOT NULL DEFAULT 300,
                created_by TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                result_summary TEXT,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS task_runs (
                id TEXT PRIMARY KEY,
                task_definition_id TEXT NOT NULL,
                queue_item_id TEXT NOT NULL,
                workflow_run_id TEXT,
                trigger_source TEXT NOT NULL DEFAULT 'manual',
                input_payload TEXT NOT NULL DEFAULT '{}',
                output_payload TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                agent_id TEXT,
                model_profile TEXT,
                started_at TEXT,
                completed_at TEXT,
                result_summary TEXT,
                error_message TEXT,
                FOREIGN KEY (task_definition_id) REFERENCES task_definitions (id),
                FOREIGN KEY (queue_item_id) REFERENCES queue_items (id)
            );

            CREATE TABLE IF NOT EXISTS workflow_runs (
                id TEXT PRIMARY KEY,
                workflow_definition_id TEXT NOT NULL,
                queue_item_id TEXT NOT NULL,
                trigger_source TEXT NOT NULL DEFAULT 'manual',
                input_payload TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                current_step TEXT,
                started_at TEXT,
                completed_at TEXT,
                result_summary TEXT,
                error_message TEXT,
                FOREIGN KEY (workflow_definition_id) REFERENCES workflow_definitions (id),
                FOREIGN KEY (queue_item_id) REFERENCES queue_items (id)
            );

            CREATE TABLE IF NOT EXISTS agent_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                purpose TEXT,
                status TEXT NOT NULL,
                preferred_model TEXT,
                notes TEXT,
                capability TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (profile_id) REFERENCES agent_profiles (id) ON DELETE CASCADE
            );
            '''
        )
        seed_task_definitions(conn)
        seed_workflow_definitions(conn)
        seed_agent_profiles(conn)


def seed_agent_profiles(conn: sqlite3.Connection) -> None:
    existing = conn.execute('SELECT COUNT(*) AS count FROM agent_profiles').fetchone()
    if existing and existing['count'] > 0:
        return

    now = utc_now_iso()
    seeds = [
        {
            'name': 'Dufus / Main Assistant',
            'role': 'Primary operator and builder',
            'purpose': 'Acts as the main assistant inside OpenClaw and Command & Control.',
            'status': 'live',
            'preferred_model': 'claude-sonnet-4-6',
            'notes': 'General purpose, orchestration, coding, planning.',
            'capability': 'Core chat, planning, coding, orchestration',
        },
        {
            'name': 'Research Scout',
            'role': 'Source scanner',
            'purpose': 'Scan YouTube, Reddit, and other inputs for high-signal material.',
            'status': 'planned',
            'preferred_model': 'claude-sonnet-4-6',
            'notes': 'Great candidate for future automation and ingestion flows.',
            'capability': 'Discovery and collection',
        },
        {
            'name': 'Trend Distiller',
            'role': 'Insight extraction',
            'purpose': 'Turn raw source material into distilled insights, summaries, and FAQ seeds.',
            'status': 'planned',
            'preferred_model': 'claude-sonnet-4-6',
            'notes': 'Bridges research to structured output.',
            'capability': 'Summaries, insights, contradictions, FAQs',
        },
        {
            'name': 'Social Packager',
            'role': 'Content formatter',
            'purpose': 'Package outputs into publishable social assets and structured content bundles.',
            'status': 'planned',
            'preferred_model': 'claude-sonnet-4-6',
            'notes': 'Later ties into video/social pipelines.',
            'capability': 'Hooks, captions, posts, snippets',
        },
    ]

    for seed in seeds:
        conn.execute(
            """
            INSERT INTO agent_profiles (
                name, role, purpose, status, preferred_model, notes, capability, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                seed['name'], seed['role'], seed['purpose'], seed['status'], seed['preferred_model'],
                seed['notes'], seed['capability'], now, now,
            ),
        )
    conn.commit()


def ingest_memory() -> tuple[int, int, int]:
    init_db()
    ingested = 0
    skipped = 0
    sources = collect_sources()

    with connect_db() as conn:
        for source in sources:
            text = source.path.read_text(encoding='utf-8')
            digest = hash_content(text)
            existing = conn.execute(
                'SELECT id, content_hash FROM memory_documents WHERE source_path = ?',
                (str(source.path.relative_to(WORKSPACE_ROOT)),),
            ).fetchone()

            payload = {
                'source_path': str(source.path.relative_to(WORKSPACE_ROOT)),
                'title': title_for_file(source.path, source.doc_type),
                'doc_type': source.doc_type,
                'date_label': source.path.stem if source.doc_type == 'daily' else None,
                'content': text,
                'content_hash': digest,
                'summary': summary_for_content(text),
                'word_count': word_count(text),
                'char_count': len(text),
                'updated_at': datetime.fromtimestamp(source.path.stat().st_mtime, timezone.utc).isoformat(),
                'ingested_at': utc_now_iso(),
            }

            if existing and existing['content_hash'] == digest:
                skipped += 1
                continue

            if existing:
                conn.execute(
                    '''
                    UPDATE memory_documents
                    SET title = :title,
                        doc_type = :doc_type,
                        date_label = :date_label,
                        content = :content,
                        content_hash = :content_hash,
                        summary = :summary,
                        word_count = :word_count,
                        char_count = :char_count,
                        updated_at = :updated_at,
                        ingested_at = :ingested_at
                    WHERE source_path = :source_path
                    ''',
                    payload,
                )
            else:
                conn.execute(
                    '''
                    INSERT INTO memory_documents (
                        source_path,
                        title,
                        doc_type,
                        date_label,
                        content,
                        content_hash,
                        summary,
                        word_count,
                        char_count,
                        updated_at,
                        ingested_at
                    ) VALUES (
                        :source_path,
                        :title,
                        :doc_type,
                        :date_label,
                        :content,
                        :content_hash,
                        :summary,
                        :word_count,
                        :char_count,
                        :updated_at,
                        :ingested_at
                    )
                    ''',
                    payload,
                )
            ingested += 1
        conn.commit()

    return ingested, skipped, len(sources)


def row_to_agent_profile(row: sqlite3.Row) -> AgentProfileRecord:
    return AgentProfileRecord(**dict(row))


def create_agent_profile(payload: AgentProfileCreate) -> AgentProfileRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO agent_profiles (name, role, purpose, status, preferred_model, notes, capability, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (payload.name, payload.role, payload.purpose, payload.status, payload.preferred_model, payload.notes, payload.capability, now, now),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM agent_profiles WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return row_to_agent_profile(row)


def update_agent_profile(profile_id: int, payload: AgentProfileUpdate) -> AgentProfileRecord:
    with connect_db() as conn:
        existing = conn.execute('SELECT * FROM agent_profiles WHERE id = ?', (profile_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail='Agent profile not found')
        updated = dict(existing)
        for key, value in payload.model_dump(exclude_unset=True).items():
            updated[key] = value
        updated['updated_at'] = utc_now_iso()
        conn.execute(
            """
            UPDATE agent_profiles
            SET name = :name, role = :role, purpose = :purpose, status = :status,
                preferred_model = :preferred_model, notes = :notes, capability = :capability, updated_at = :updated_at
            WHERE id = :id
            """,
            updated,
        )
        conn.commit()
        row = conn.execute('SELECT * FROM agent_profiles WHERE id = ?', (profile_id,)).fetchone()
    return row_to_agent_profile(row)


def delete_agent_profile(profile_id: int) -> None:
    with connect_db() as conn:
        cursor = conn.execute('DELETE FROM agent_profiles WHERE id = ?', (profile_id,))
        conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail='Agent profile not found')


def run_openclaw_command(args: list[str]) -> OpenClawCommandResult:
    result = subprocess.run(
        ['openclaw', *args],
        cwd=str(WORKSPACE_ROOT),
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, 'PYTHONUNBUFFERED': '1'},
    )
    return OpenClawCommandResult(
        ok=result.returncode == 0,
        command=['openclaw', *args],
        stdout=result.stdout,
        stderr=result.stderr,
        returncode=result.returncode,
    )


def get_openclaw_health() -> dict:
    result = run_openclaw_command(['health', '--json'])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw health failed')
    return json.loads(result.stdout)


def get_openclaw_sessions() -> dict:
    result = run_openclaw_command(['sessions', '--json', '--all-agents'])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw sessions failed')
    return json.loads(result.stdout)


def get_openclaw_gateway_status() -> str:
    result = run_openclaw_command(['gateway', 'status'])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw gateway status failed')
    return result.stdout


def get_openclaw_status() -> str:
    result = run_openclaw_command(['status'])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw status failed')
    return result.stdout


def get_openclaw_logs(limit: int = 80) -> list[str]:
    result = run_openclaw_command(['logs', '--plain', '--limit', str(limit)])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw logs failed')
    return [line for line in result.stdout.splitlines() if line.strip()]


app = FastAPI(title='Command & Control API', version='0.2.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.on_event('startup')
def startup() -> None:
    init_db()
    ingest_memory()


@app.on_event('shutdown')
def shutdown() -> None:
    pass


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/api/memory/ingest', response_model=IngestResponse)
def ingest() -> IngestResponse:
    ingested, skipped, total = ingest_memory()
    return IngestResponse(ingested=ingested, skipped=skipped, total=total)


@app.get('/api/memory', response_model=list[MemoryListItem])
def list_memory() -> list[MemoryListItem]:
    with connect_db() as conn:
        rows = conn.execute(
            '''
            SELECT id, title, doc_type, source_path, date_label, word_count, char_count, updated_at, summary
            FROM memory_documents
            ORDER BY CASE WHEN doc_type = 'long_term' THEN 0 ELSE 1 END, date_label DESC, updated_at DESC
            '''
        ).fetchall()
    return [MemoryListItem(**dict(row)) for row in rows]


@app.get('/api/memory/{document_id}', response_model=MemoryDocument)
def get_memory(document_id: int) -> MemoryDocument:
    with connect_db() as conn:
        row = conn.execute(
            '''
            SELECT id, title, doc_type, source_path, date_label, word_count, char_count, updated_at, summary, content
            FROM memory_documents
            WHERE id = ?
            ''',
            (document_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Memory document not found')
    return MemoryDocument(**dict(row))


# ---------------------------------------------------------------------------
# Domain helpers
# ---------------------------------------------------------------------------

def new_id() -> str:
    return uuid.uuid4().hex


def jdump(val) -> str:
    return json.dumps(val)


def jload(val: str | None, default=None):
    if val is None:
        return default if default is not None else {}
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return default if default is not None else {}


def jload_list(val: str | None) -> list:
    result = jload(val, [])
    return result if isinstance(result, list) else []


def row_to_task_definition(row: sqlite3.Row) -> TaskDefinitionRecord:
    d = dict(row)
    rp = jload(d.get('retry_policy'), {'max_retries': 2, 'retry_delay_seconds': 30})
    return TaskDefinitionRecord(
        id=d['id'],
        name=d['name'],
        description=d.get('description'),
        task_type=d['task_type'],
        owner_type=d.get('owner_type', 'user'),
        trigger_modes=jload_list(d.get('trigger_modes')),
        enabled=bool(d['enabled']),
        config=jload(d.get('config'), {}),
        input_schema=jload(d.get('input_schema'), {}),
        output_schema=jload(d.get('output_schema'), {}),
        execution_backend=d.get('execution_backend', 'openclaw'),
        assigned_agent_id=d.get('assigned_agent_id'),
        allowed_agent_ids=jload_list(d.get('allowed_agent_ids')),
        agent_selection_mode=d.get('agent_selection_mode', 'auto'),
        required_capabilities=jload_list(d.get('required_capabilities')),
        model_profile=d.get('model_profile', 'balanced'),
        max_tokens=d.get('max_tokens'),
        reasoning_level=d.get('reasoning_level', 'medium'),
        budget_policy=d.get('budget_policy', 'balanced'),
        priority=d.get('priority', 5),
        timeout_seconds=d.get('timeout_seconds', 300),
        retry_policy=RetryPolicy(**rp),
        tags=jload_list(d.get('tags')),
        created_by=d.get('created_by', 'user'),
        created_at=d['created_at'],
        updated_at=d['updated_at'],
    )


def row_to_workflow_definition(row: sqlite3.Row) -> WorkflowDefinitionRecord:
    d = dict(row)
    raw_steps = jload_list(d.get('steps'))
    steps = [WorkflowStep(**s) if isinstance(s, dict) else s for s in raw_steps]
    return WorkflowDefinitionRecord(
        id=d['id'],
        name=d['name'],
        description=d.get('description'),
        enabled=bool(d['enabled']),
        trigger_modes=jload_list(d.get('trigger_modes')),
        schedule=d.get('schedule'),
        steps=steps,
        error_policy=jload(d.get('error_policy'), {}),
        created_by=d.get('created_by', 'user'),
        created_at=d['created_at'],
        updated_at=d['updated_at'],
    )


def row_to_queue_item(row: sqlite3.Row) -> QueueItemRecord:
    d = dict(row)
    return QueueItemRecord(
        id=d['id'],
        queue_item_type=d['queue_item_type'],
        source_type=d['source_type'],
        source_definition_id=d['source_definition_id'],
        workflow_run_id=d.get('workflow_run_id'),
        parent_queue_item_id=d.get('parent_queue_item_id'),
        status=d['status'],
        assigned_agent_id=d.get('assigned_agent_id'),
        allowed_agent_ids=jload_list(d.get('allowed_agent_ids')),
        agent_selection_mode=d.get('agent_selection_mode', 'auto'),
        required_capabilities=jload_list(d.get('required_capabilities')),
        model_profile=d.get('model_profile', 'balanced'),
        priority=d.get('priority', 5),
        payload=jload(d.get('payload'), {}),
        retry_count=d.get('retry_count', 0),
        max_retries=d.get('max_retries', 2),
        timeout_seconds=d.get('timeout_seconds', 300),
        created_by=d.get('created_by', 'user'),
        created_at=d['created_at'],
        started_at=d.get('started_at'),
        completed_at=d.get('completed_at'),
        result_summary=d.get('result_summary'),
        error_message=d.get('error_message'),
    )


def row_to_task_run(row: sqlite3.Row) -> TaskRunRecord:
    d = dict(row)
    return TaskRunRecord(
        id=d['id'],
        task_definition_id=d['task_definition_id'],
        queue_item_id=d['queue_item_id'],
        workflow_run_id=d.get('workflow_run_id'),
        trigger_source=d.get('trigger_source', 'manual'),
        input_payload=jload(d.get('input_payload'), {}),
        output_payload=jload(d.get('output_payload'), {}),
        status=d['status'],
        agent_id=d.get('agent_id'),
        model_profile=d.get('model_profile'),
        started_at=d.get('started_at'),
        completed_at=d.get('completed_at'),
        result_summary=d.get('result_summary'),
        error_message=d.get('error_message'),
    )


def row_to_workflow_run(row: sqlite3.Row) -> WorkflowRunRecord:
    d = dict(row)
    return WorkflowRunRecord(
        id=d['id'],
        workflow_definition_id=d['workflow_definition_id'],
        queue_item_id=d['queue_item_id'],
        trigger_source=d.get('trigger_source', 'manual'),
        input_payload=jload(d.get('input_payload'), {}),
        status=d['status'],
        current_step=d.get('current_step'),
        started_at=d.get('started_at'),
        completed_at=d.get('completed_at'),
        result_summary=d.get('result_summary'),
        error_message=d.get('error_message'),
    )


def enqueue_task_run(
    task_def_id: str,
    trigger_source: str = 'manual',
    payload: dict | None = None,
    created_by: str = 'user',
    workflow_run_id: str | None = None,
    parent_queue_item_id: str | None = None,
) -> tuple[QueueItemRecord, TaskRunRecord]:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM task_definitions WHERE id = ?', (task_def_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Task definition not found')
        td = row_to_task_definition(row)

    now = utc_now_iso()
    qi_id = new_id()
    tr_id = new_id()

    with connect_db() as conn:
        conn.execute(
            '''
            INSERT INTO queue_items (
                id, queue_item_type, source_type, source_definition_id,
                workflow_run_id, parent_queue_item_id,
                status, assigned_agent_id, allowed_agent_ids,
                agent_selection_mode, required_capabilities,
                model_profile, priority, payload,
                retry_count, max_retries, timeout_seconds,
                created_by, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''',
            (
                qi_id, 'task_run', 'task_definition', task_def_id,
                workflow_run_id, parent_queue_item_id,
                'queued', td.assigned_agent_id, jdump(td.allowed_agent_ids),
                td.agent_selection_mode, jdump(td.required_capabilities),
                td.model_profile, td.priority, jdump(payload or {}),
                0, td.retry_policy.max_retries, td.timeout_seconds,
                created_by, now,
            ),
        )
        conn.execute(
            '''
            INSERT INTO task_runs (
                id, task_definition_id, queue_item_id, workflow_run_id,
                trigger_source, input_payload, output_payload, status,
                agent_id, model_profile
            ) VALUES (?,?,?,?,?,?,?,?,?,?)
            ''',
            (
                tr_id, task_def_id, qi_id, workflow_run_id,
                trigger_source, jdump(payload or {}), '{}', 'queued',
                td.assigned_agent_id, td.model_profile,
            ),
        )
        conn.commit()
        qi_row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (qi_id,)).fetchone()
        tr_row = conn.execute('SELECT * FROM task_runs WHERE id = ?', (tr_id,)).fetchone()

    return row_to_queue_item(qi_row), row_to_task_run(tr_row)


def enqueue_workflow_run(
    workflow_def_id: str,
    trigger_source: str = 'manual',
    payload: dict | None = None,
    created_by: str = 'user',
) -> tuple[QueueItemRecord, WorkflowRunRecord]:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM workflow_definitions WHERE id = ?', (workflow_def_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Workflow definition not found')
        wd = row_to_workflow_definition(row)

    now = utc_now_iso()
    qi_id = new_id()
    wr_id = new_id()
    first_step = wd.steps[0].step_id if wd.steps else None

    with connect_db() as conn:
        conn.execute(
            '''
            INSERT INTO queue_items (
                id, queue_item_type, source_type, source_definition_id,
                status, model_profile, priority, payload,
                retry_count, max_retries, timeout_seconds,
                created_by, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''',
            (
                qi_id, 'workflow_run', 'workflow_definition', workflow_def_id,
                'queued', 'balanced', 5, jdump(payload or {}),
                0, 2, 3600, created_by, now,
            ),
        )
        conn.execute(
            '''
            INSERT INTO workflow_runs (
                id, workflow_definition_id, queue_item_id,
                trigger_source, input_payload, status, current_step
            ) VALUES (?,?,?,?,?,?,?)
            ''',
            (wr_id, workflow_def_id, qi_id, trigger_source, jdump(payload or {}), 'queued', first_step),
        )
        conn.commit()

        # Create child queue items for each step
        for step in wd.steps:
            task_row = conn.execute(
                'SELECT * FROM task_definitions WHERE id = ?', (step.task_definition_id,)
            ).fetchone()
            if task_row is None:
                continue
            td = row_to_task_definition(task_row)
            child_qi_id = new_id()
            child_tr_id = new_id()
            conn.execute(
                '''
                INSERT INTO queue_items (
                    id, queue_item_type, source_type, source_definition_id,
                    workflow_run_id, parent_queue_item_id,
                    status, assigned_agent_id, allowed_agent_ids,
                    agent_selection_mode, required_capabilities,
                    model_profile, priority, payload,
                    retry_count, max_retries, timeout_seconds,
                    created_by, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ''',
                (
                    child_qi_id, 'task_run', 'workflow_step', step.task_definition_id,
                    wr_id, qi_id,
                    'queued', td.assigned_agent_id, jdump(td.allowed_agent_ids),
                    td.agent_selection_mode, jdump(td.required_capabilities),
                    td.model_profile, td.priority, jdump(payload or {}),
                    0, td.retry_policy.max_retries, td.timeout_seconds,
                    created_by, now,
                ),
            )
            conn.execute(
                '''
                INSERT INTO task_runs (
                    id, task_definition_id, queue_item_id, workflow_run_id,
                    trigger_source, input_payload, output_payload, status,
                    agent_id, model_profile
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                ''',
                (
                    child_tr_id, step.task_definition_id, child_qi_id, wr_id,
                    trigger_source, jdump(payload or {}), '{}', 'queued',
                    td.assigned_agent_id, td.model_profile,
                ),
            )
        conn.commit()

        qi_row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (qi_id,)).fetchone()
        wr_row = conn.execute('SELECT * FROM workflow_runs WHERE id = ?', (wr_id,)).fetchone()

    return row_to_queue_item(qi_row), row_to_workflow_run(wr_row)


def seed_task_definitions(conn: sqlite3.Connection) -> None:
    existing = conn.execute('SELECT COUNT(*) AS count FROM task_definitions').fetchone()
    if existing and existing['count'] > 0:
        return

    now = utc_now_iso()
    seeds = [
        {
            'id': new_id(),
            'name': 'Fetch docs page',
            'description': 'Fetch and summarise a documentation page.',
            'task_type': 'web_fetch',
            'owner_type': 'user',
            'trigger_modes': jdump(['manual']),
            'enabled': 1,
            'config': '{}',
            'input_schema': '{}',
            'output_schema': '{}',
            'execution_backend': 'openclaw',
            'assigned_agent_id': None,
            'allowed_agent_ids': jdump(['fetcher_bot']),
            'agent_selection_mode': 'pool',
            'required_capabilities': jdump(['web_fetch', 'summarize']),
            'model_profile': 'token_light',
            'max_tokens': 4000,
            'reasoning_level': 'low',
            'budget_policy': 'cheap',
            'priority': 3,
            'timeout_seconds': 120,
            'retry_policy': jdump({'max_retries': 2, 'retry_delay_seconds': 30}),
            'tags': jdump(['fetch', 'docs']),
            'created_by': 'system',
        },
        {
            'id': new_id(),
            'name': 'Implement queue logic',
            'description': 'Coding task: implement wrapper queue runtime logic.',
            'task_type': 'coding',
            'owner_type': 'user',
            'trigger_modes': jdump(['manual']),
            'enabled': 1,
            'config': '{}',
            'input_schema': '{}',
            'output_schema': '{}',
            'execution_backend': 'openclaw',
            'assigned_agent_id': 'rufus',
            'allowed_agent_ids': jdump(['rufus']),
            'agent_selection_mode': 'fixed',
            'required_capabilities': jdump(['coding', 'refactor', 'tests']),
            'model_profile': 'coding_heavy',
            'max_tokens': 24000,
            'reasoning_level': 'high',
            'budget_policy': 'premium',
            'priority': 8,
            'timeout_seconds': 1800,
            'retry_policy': jdump({'max_retries': 1, 'retry_delay_seconds': 60}),
            'tags': jdump(['coding', 'queue']),
            'created_by': 'system',
        },
        {
            'id': new_id(),
            'name': 'Review queue logic',
            'description': 'Code review task: review and approve queue wrapper implementation.',
            'task_type': 'review',
            'owner_type': 'user',
            'trigger_modes': jdump(['manual', 'dependency']),
            'enabled': 1,
            'config': '{}',
            'input_schema': '{}',
            'output_schema': '{}',
            'execution_backend': 'openclaw',
            'assigned_agent_id': 'dufus',
            'allowed_agent_ids': jdump(['dufus']),
            'agent_selection_mode': 'fixed',
            'required_capabilities': jdump(['code_review', 'git_push']),
            'model_profile': 'high_reasoning',
            'max_tokens': 16000,
            'reasoning_level': 'medium',
            'budget_policy': 'balanced',
            'priority': 7,
            'timeout_seconds': 1200,
            'retry_policy': jdump({'max_retries': 1, 'retry_delay_seconds': 60}),
            'tags': jdump(['review', 'queue']),
            'created_by': 'system',
        },
    ]

    for s in seeds:
        conn.execute(
            '''
            INSERT INTO task_definitions (
                id, name, description, task_type, owner_type, trigger_modes,
                enabled, config, input_schema, output_schema, execution_backend,
                assigned_agent_id, allowed_agent_ids, agent_selection_mode,
                required_capabilities, model_profile, max_tokens,
                reasoning_level, budget_policy, priority, timeout_seconds,
                retry_policy, tags, created_by, created_at, updated_at
            ) VALUES (
                :id, :name, :description, :task_type, :owner_type, :trigger_modes,
                :enabled, :config, :input_schema, :output_schema, :execution_backend,
                :assigned_agent_id, :allowed_agent_ids, :agent_selection_mode,
                :required_capabilities, :model_profile, :max_tokens,
                :reasoning_level, :budget_policy, :priority, :timeout_seconds,
                :retry_policy, :tags, :created_by, :now, :now
            )
            ''',
            {**s, 'now': now},
        )
    conn.commit()


def seed_workflow_definitions(conn: sqlite3.Connection) -> None:
    existing = conn.execute('SELECT COUNT(*) AS count FROM workflow_definitions').fetchone()
    if existing and existing['count'] > 0:
        return

    # Get the coding + review task ids (2nd and 3rd seeds)
    rows = conn.execute(
        "SELECT id, name FROM task_definitions WHERE name IN ('Implement queue logic', 'Review queue logic')"
    ).fetchall()
    task_ids: dict[str, str] = {row['name']: row['id'] for row in rows}
    coding_id = task_ids.get('Implement queue logic', '')
    review_id = task_ids.get('Review queue logic', '')

    if not coding_id or not review_id:
        return

    now = utc_now_iso()
    steps = [
        {'step_id': 'step_1', 'task_definition_id': coding_id, 'name': 'Rufus codes', 'on_success': 'step_2', 'on_failure': 'fail_workflow', 'conditions': []},
        {'step_id': 'step_2', 'task_definition_id': review_id, 'name': 'Dufus reviews and pushes', 'on_success': 'complete', 'on_failure': 'fail_workflow', 'conditions': []},
    ]

    conn.execute(
        '''
        INSERT INTO workflow_definitions (
            id, name, description, enabled, trigger_modes, schedule,
            steps, error_policy, created_by, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ''',
        (
            new_id(),
            'Rufus codes → Dufus reviews → Dufus pushes',
            'Standard coding workflow: Rufus implements, Dufus reviews and pushes.',
            1, jdump(['manual']), None,
            jdump(steps), '{}', 'system', now, now,
        ),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Task Definition CRUD
# ---------------------------------------------------------------------------

@app.get('/api/tasks', response_model=list[TaskDefinitionRecord])
def list_task_definitions() -> list[TaskDefinitionRecord]:
    with connect_db() as conn:
        rows = conn.execute('SELECT * FROM task_definitions ORDER BY created_at DESC').fetchall()
    return [row_to_task_definition(row) for row in rows]


@app.post('/api/tasks', response_model=TaskDefinitionRecord)
def create_task_definition(body: TaskDefinitionCreate) -> TaskDefinitionRecord:
    now = utc_now_iso()
    tid = new_id()
    with connect_db() as conn:
        conn.execute(
            '''
            INSERT INTO task_definitions (
                id, name, description, task_type, owner_type, trigger_modes,
                enabled, config, input_schema, output_schema, execution_backend,
                assigned_agent_id, allowed_agent_ids, agent_selection_mode,
                required_capabilities, model_profile, max_tokens,
                reasoning_level, budget_policy, priority, timeout_seconds,
                retry_policy, tags, created_by, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''',
            (
                tid, body.name, body.description, body.task_type, body.owner_type,
                jdump(body.trigger_modes), int(body.enabled),
                jdump(body.config), jdump(body.input_schema), jdump(body.output_schema),
                body.execution_backend, body.assigned_agent_id,
                jdump(body.allowed_agent_ids), body.agent_selection_mode,
                jdump(body.required_capabilities), body.model_profile, body.max_tokens,
                body.reasoning_level, body.budget_policy, body.priority,
                body.timeout_seconds, jdump(body.retry_policy.model_dump()),
                jdump(body.tags), body.created_by, now, now,
            ),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM task_definitions WHERE id = ?', (tid,)).fetchone()
    return row_to_task_definition(row)


@app.get('/api/tasks/{task_id}', response_model=TaskDefinitionRecord)
def get_task_definition(task_id: str) -> TaskDefinitionRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM task_definitions WHERE id = ?', (task_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Task definition not found')
    return row_to_task_definition(row)


@app.put('/api/tasks/{task_id}', response_model=TaskDefinitionRecord)
def update_task_definition(task_id: str, body: TaskDefinitionUpdate) -> TaskDefinitionRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM task_definitions WHERE id = ?', (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Task definition not found')
        existing = row_to_task_definition(row)
        updates = body.model_dump(exclude_unset=True)

        # Serialise list/dict fields
        for list_field in ('trigger_modes', 'allowed_agent_ids', 'required_capabilities', 'tags'):
            if list_field in updates and updates[list_field] is not None:
                updates[list_field] = jdump(updates[list_field])
        if 'retry_policy' in updates and updates['retry_policy'] is not None:
            updates['retry_policy'] = jdump(updates['retry_policy'].model_dump() if isinstance(updates['retry_policy'], RetryPolicy) else updates['retry_policy'])
        if 'enabled' in updates:
            updates['enabled'] = int(bool(updates['enabled']))

        set_clause = ', '.join(f'{k} = :{k}' for k in updates)
        updates['id'] = task_id
        updates['updated_at'] = now
        conn.execute(
            f'UPDATE task_definitions SET {set_clause}, updated_at = :updated_at WHERE id = :id',
            updates,
        )
        conn.commit()
        row = conn.execute('SELECT * FROM task_definitions WHERE id = ?', (task_id,)).fetchone()
    return row_to_task_definition(row)


@app.delete('/api/tasks/{task_id}')
def delete_task_definition(task_id: str) -> dict[str, bool]:
    with connect_db() as conn:
        cursor = conn.execute('DELETE FROM task_definitions WHERE id = ?', (task_id,))
        conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail='Task definition not found')
    return {'ok': True}


@app.post('/api/tasks/{task_id}/run', response_model=TaskRunRecord)
def run_task_definition(task_id: str) -> TaskRunRecord:
    _, task_run = enqueue_task_run(task_id, trigger_source='manual')
    return task_run


# ---------------------------------------------------------------------------
# Workflow Definition CRUD
# ---------------------------------------------------------------------------

@app.get('/api/workflows', response_model=list[WorkflowDefinitionRecord])
def list_workflow_definitions() -> list[WorkflowDefinitionRecord]:
    with connect_db() as conn:
        rows = conn.execute('SELECT * FROM workflow_definitions ORDER BY created_at DESC').fetchall()
    return [row_to_workflow_definition(row) for row in rows]


@app.post('/api/workflows', response_model=WorkflowDefinitionRecord)
def create_workflow_definition(body: WorkflowDefinitionCreate) -> WorkflowDefinitionRecord:
    now = utc_now_iso()
    wid = new_id()
    with connect_db() as conn:
        conn.execute(
            '''
            INSERT INTO workflow_definitions (
                id, name, description, enabled, trigger_modes, schedule,
                steps, error_policy, created_by, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ''',
            (
                wid, body.name, body.description, int(body.enabled),
                jdump(body.trigger_modes), body.schedule,
                jdump([s.model_dump() for s in body.steps]),
                jdump(body.error_policy), body.created_by, now, now,
            ),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM workflow_definitions WHERE id = ?', (wid,)).fetchone()
    return row_to_workflow_definition(row)


@app.get('/api/workflows/{workflow_id}', response_model=WorkflowDefinitionRecord)
def get_workflow_definition(workflow_id: str) -> WorkflowDefinitionRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM workflow_definitions WHERE id = ?', (workflow_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Workflow definition not found')
    return row_to_workflow_definition(row)


@app.put('/api/workflows/{workflow_id}', response_model=WorkflowDefinitionRecord)
def update_workflow_definition(workflow_id: str, body: WorkflowDefinitionUpdate) -> WorkflowDefinitionRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM workflow_definitions WHERE id = ?', (workflow_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Workflow definition not found')
        updates = body.model_dump(exclude_unset=True)
        if 'trigger_modes' in updates and updates['trigger_modes'] is not None:
            updates['trigger_modes'] = jdump(updates['trigger_modes'])
        if 'steps' in updates and updates['steps'] is not None:
            updates['steps'] = jdump([s.model_dump() if isinstance(s, WorkflowStep) else s for s in updates['steps']])
        if 'error_policy' in updates and updates['error_policy'] is not None:
            updates['error_policy'] = jdump(updates['error_policy'])
        if 'enabled' in updates:
            updates['enabled'] = int(bool(updates['enabled']))
        set_clause = ', '.join(f'{k} = :{k}' for k in updates)
        updates['id'] = workflow_id
        updates['updated_at'] = now
        conn.execute(
            f'UPDATE workflow_definitions SET {set_clause}, updated_at = :updated_at WHERE id = :id',
            updates,
        )
        conn.commit()
        row = conn.execute('SELECT * FROM workflow_definitions WHERE id = ?', (workflow_id,)).fetchone()
    return row_to_workflow_definition(row)


@app.delete('/api/workflows/{workflow_id}')
def delete_workflow_definition(workflow_id: str) -> dict[str, bool]:
    with connect_db() as conn:
        cursor = conn.execute('DELETE FROM workflow_definitions WHERE id = ?', (workflow_id,))
        conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail='Workflow definition not found')
    return {'ok': True}


@app.post('/api/workflows/{workflow_id}/run', response_model=WorkflowRunRecord)
def run_workflow_definition(workflow_id: str) -> WorkflowRunRecord:
    _, workflow_run = enqueue_workflow_run(workflow_id, trigger_source='manual')
    return workflow_run


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

@app.get('/api/queue', response_model=list[QueueItemRecord])
def list_queue_items(status: str | None = None) -> list[QueueItemRecord]:
    with connect_db() as conn:
        if status:
            rows = conn.execute(
                'SELECT * FROM queue_items WHERE status = ? ORDER BY created_at DESC',
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT * FROM queue_items ORDER BY created_at DESC'
            ).fetchall()
    return [row_to_queue_item(row) for row in rows]


@app.get('/api/queue/{item_id}', response_model=QueueItemRecord)
def get_queue_item(item_id: str) -> QueueItemRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Queue item not found')
    return row_to_queue_item(row)


@app.post('/api/queue/{item_id}/cancel')
def cancel_queue_item(item_id: str) -> dict[str, bool]:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Queue item not found')
        if row['status'] in ('completed', 'failed', 'cancelled'):
            raise HTTPException(status_code=400, detail=f'Cannot cancel item in status: {row["status"]}')
        conn.execute(
            'UPDATE queue_items SET status = ?, completed_at = ? WHERE id = ?',
            ('cancelled', now, item_id),
        )
        conn.commit()
    return {'ok': True}


@app.post('/api/queue/{item_id}/retry')
def retry_queue_item(item_id: str) -> QueueItemRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Queue item not found')
        conn.execute(
            '''
            UPDATE queue_items
            SET status = 'queued', retry_count = retry_count + 1,
                started_at = NULL, completed_at = NULL,
                result_summary = NULL, error_message = NULL
            WHERE id = ?
            ''',
            (item_id,),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
    return row_to_queue_item(row)


@app.post('/api/queue/{item_id}/claim', response_model=QueueItemRecord)
def claim_queue_item(item_id: str, body: ClaimRequest) -> QueueItemRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Queue item not found')
        if row['status'] != 'queued':
            raise HTTPException(status_code=400, detail=f'Item not claimable, status: {row["status"]}')

        assigned = row['assigned_agent_id']
        allowed = jload_list(row['allowed_agent_ids'])
        mode = row['agent_selection_mode']

        if mode == 'fixed' and assigned and body.agent_id != assigned:
            raise HTTPException(status_code=403, detail=f'Agent {body.agent_id} not allowed (fixed to {assigned})')
        if mode == 'pool' and allowed and body.agent_id not in allowed:
            raise HTTPException(status_code=403, detail=f'Agent {body.agent_id} not in allowed pool')

        conn.execute(
            'UPDATE queue_items SET status = ?, assigned_agent_id = ?, started_at = ? WHERE id = ?',
            ('running', body.agent_id, now, item_id),
        )
        # Update linked task_run
        conn.execute(
            'UPDATE task_runs SET status = ?, agent_id = ?, started_at = ? WHERE queue_item_id = ?',
            ('running', body.agent_id, now, item_id),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
    return row_to_queue_item(row)


@app.post('/api/queue/{item_id}/complete', response_model=QueueItemRecord)
def complete_queue_item(item_id: str, body: CompleteRequest) -> QueueItemRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Queue item not found')
        conn.execute(
            '''
            UPDATE queue_items
            SET status = 'completed', completed_at = ?, result_summary = ?
            WHERE id = ?
            ''',
            (now, body.result_summary, item_id),
        )
        conn.execute(
            '''
            UPDATE task_runs
            SET status = 'completed', completed_at = ?,
                output_payload = ?, result_summary = ?
            WHERE queue_item_id = ?
            ''',
            (now, jdump(body.output_payload), body.result_summary, item_id),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
    return row_to_queue_item(row)


@app.post('/api/queue/{item_id}/fail', response_model=QueueItemRecord)
def fail_queue_item(item_id: str, body: FailRequest) -> QueueItemRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Queue item not found')
        conn.execute(
            '''
            UPDATE queue_items
            SET status = 'failed', completed_at = ?, error_message = ?
            WHERE id = ?
            ''',
            (now, body.error_message, item_id),
        )
        conn.execute(
            '''
            UPDATE task_runs
            SET status = 'failed', completed_at = ?, error_message = ?
            WHERE queue_item_id = ?
            ''',
            (now, body.error_message, item_id),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM queue_items WHERE id = ?', (item_id,)).fetchone()
    return row_to_queue_item(row)


# ---------------------------------------------------------------------------
# Task Runs & Workflow Runs history
# ---------------------------------------------------------------------------

@app.get('/api/task-runs', response_model=list[TaskRunRecord])
def list_task_runs(task_definition_id: str | None = None) -> list[TaskRunRecord]:
    with connect_db() as conn:
        if task_definition_id:
            rows = conn.execute(
                'SELECT * FROM task_runs WHERE task_definition_id = ? ORDER BY rowid DESC LIMIT 100',
                (task_definition_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT * FROM task_runs ORDER BY rowid DESC LIMIT 100'
            ).fetchall()
    return [row_to_task_run(row) for row in rows]


@app.get('/api/task-runs/{run_id}', response_model=TaskRunRecord)
def get_task_run(run_id: str) -> TaskRunRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM task_runs WHERE id = ?', (run_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Task run not found')
    return row_to_task_run(row)


@app.get('/api/workflow-runs', response_model=list[WorkflowRunRecord])
def list_workflow_runs(workflow_definition_id: str | None = None) -> list[WorkflowRunRecord]:
    with connect_db() as conn:
        if workflow_definition_id:
            rows = conn.execute(
                'SELECT * FROM workflow_runs WHERE workflow_definition_id = ? ORDER BY rowid DESC LIMIT 100',
                (workflow_definition_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT * FROM workflow_runs ORDER BY rowid DESC LIMIT 100'
            ).fetchall()
    return [row_to_workflow_run(row) for row in rows]


@app.get('/api/workflow-runs/{run_id}', response_model=WorkflowRunRecord)
def get_workflow_run(run_id: str) -> WorkflowRunRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM workflow_runs WHERE id = ?', (run_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Workflow run not found')
    return row_to_workflow_run(row)


@app.get('/api/oc/agents')
def oc_agents() -> list[dict]:
    result = run_openclaw_command(['agents', 'list', '--json'])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw agents list failed')
    return json.loads(result.stdout)


@app.get('/api/oc/gateway-token')
def oc_gateway_token() -> dict[str, str]:
    """Returns whether gateway auth is available (token stays server-side)."""
    token = _get_gateway_token()
    return {'token': 'available' if token else 'missing'}


def _get_gateway_token() -> str:
    config_path = Path.home() / '.openclaw' / 'openclaw.json'
    try:
        with open(config_path) as f:
            config = json.load(f)
        token = config.get('gateway', {}).get('auth', {}).get('token', '')
        if not token:
            raise HTTPException(status_code=500, detail='No gateway token found in config')
        return token
    except (FileNotFoundError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=500, detail=f'Could not read gateway config: {e}')


GATEWAY_URL = 'http://127.0.0.1:18789'


@app.post('/api/oc/chat')
async def oc_chat_proxy(request: Request):
    """Proxy chat completions to the OpenClaw gateway, streaming SSE back to the browser."""
    body = await request.json()
    agent_id = body.pop('agentId', 'main')
    token = _get_gateway_token()

    # Build the OpenAI-compatible request
    payload = {
        'model': f'openclaw:{agent_id}',
        'stream': True,
        'messages': body.get('messages', []),
    }
    if body.get('user'):
        payload['user'] = body['user']

    async def stream_generator():
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            async with client.stream(
                'POST',
                f'{GATEWAY_URL}/v1/chat/completions',
                json=payload,
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json',
                    'x-openclaw-agent-id': agent_id,
                    'x-openclaw-scopes': 'operator.read,operator.write',
                },
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield f'data: {{"error": {json.dumps(error_body.decode())}}}\n\n'
                    return
                async for line in response.aiter_lines():
                    if line:
                        yield f'{line}\n\n'

    return StreamingResponse(stream_generator(), media_type='text/event-stream')


@app.get('/api/oc/health')
def oc_health() -> dict:
    return get_openclaw_health()


@app.get('/api/oc/sessions')
def oc_sessions() -> dict:
    return get_openclaw_sessions()


@app.get('/api/oc/gateway')
def oc_gateway() -> dict[str, str]:
    return {'text': get_openclaw_gateway_status()}


@app.get('/api/oc/status', response_model=OpenClawStatusPayload)
def oc_status() -> OpenClawStatusPayload:
    return OpenClawStatusPayload(
        summary=get_openclaw_status(),
        health=get_openclaw_health(),
        sessions=get_openclaw_sessions(),
        gateway=get_openclaw_gateway_status(),
    )


@app.get('/api/oc/logs', response_model=OpenClawLogPayload)
def oc_logs(limit: int = 80) -> OpenClawLogPayload:
    return OpenClawLogPayload(lines=get_openclaw_logs(limit=limit))


@app.get('/api/oc/session-history')
def oc_session_history(sessionKey: str, limit: int = 40) -> dict:
    """Proxy session history from the OpenClaw gateway, filtering to user+assistant text only.
    Fetches a large raw batch (tool calls dominate) then returns the last `limit` chat messages.
    """
    token = _get_gateway_token()
    url = f'{GATEWAY_URL}/sessions/{sessionKey}/history'
    # Fetch a large batch since most items are tool calls
    try:
        resp = httpx.get(url, headers={'Authorization': f'Bearer {token}'}, params={'limit': 1000}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to fetch session history: {e}')

    def extract_text(content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get('type') == 'text':
                    parts.append(block.get('text', ''))
                elif isinstance(block, str):
                    parts.append(block)
            return ''.join(parts)
        return ''

    # Filter to user/assistant messages with non-empty text content
    items = data.get('items', [])
    messages = []
    for item in items:
        role = item.get('role')
        if role not in ('user', 'assistant'):
            continue
        text = extract_text(item.get('content', ''))
        if text.strip():
            messages.append({'role': role, 'content': text})

    # Return only the last N chat messages
    return {'sessionKey': sessionKey, 'messages': messages[-limit:]}


@app.get('/api/oc/memory/status')
def oc_memory_status() -> list[dict]:
    """Proxy OpenClaw memory status (per-agent index info)."""
    result = run_openclaw_command(['memory', 'status', '--json'])
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw memory status failed')
    return json.loads(result.stdout)


class OcMemorySearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    agent_id: str = 'main'
    max_results: int = Field(default=10, ge=1, le=50)


@app.post('/api/oc/memory/search')
def oc_memory_search(body: OcMemorySearchRequest) -> dict:
    """Proxy OpenClaw memory search (vector + BM25 hybrid)."""
    args = [
        'memory', 'search',
        '--query', body.query,
        '--agent', body.agent_id,
        '--max-results', str(body.max_results),
        '--json',
    ]
    result = run_openclaw_command(args)
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw memory search failed')
    return json.loads(result.stdout)


@app.post('/api/oc/memory/reindex')
def oc_memory_reindex(agent_id: str = 'main', force: bool = False) -> dict:
    """Trigger OpenClaw memory reindex."""
    args = ['memory', 'index', '--agent', agent_id]
    if force:
        args.append('--force')
    result = run_openclaw_command(args)
    if not result.ok:
        raise HTTPException(status_code=500, detail=result.stderr or 'openclaw memory reindex failed')
    return {'ok': True, 'output': result.stdout.strip()}


@app.get('/api/oc/memory/files')
def oc_memory_files(agent_id: str = 'main') -> dict:
    """List memory files for an agent from the workspace filesystem.
    Returns both raw file listing and OC index status for comparison."""
    # Determine workspace for this agent
    agents_result = run_openclaw_command(['agents', 'list', '--json'])
    workspace_dir = str(WORKSPACE_ROOT)
    if agents_result.ok:
        agents = json.loads(agents_result.stdout)
        for agent in agents:
            if agent.get('id') == agent_id and agent.get('workspace'):
                workspace_dir = agent['workspace']
                break

    workspace_path = Path(workspace_dir)
    memory_dir = workspace_path / 'memory'
    memory_md = workspace_path / 'MEMORY.md'

    files = []

    # MEMORY.md (long-term)
    if memory_md.exists():
        text = memory_md.read_text(encoding='utf-8')
        files.append({
            'path': 'MEMORY.md',
            'type': 'long_term',
            'date_label': None,
            'word_count': len(text.split()),
            'char_count': len(text),
            'modified': datetime.fromtimestamp(memory_md.stat().st_mtime, timezone.utc).isoformat(),
            'summary': _first_meaningful_line(text),
        })

    # memory/*.md (daily/other)
    if memory_dir.exists():
        for path in sorted(memory_dir.glob('*.md'), reverse=True):
            text = path.read_text(encoding='utf-8')
            files.append({
                'path': f'memory/{path.name}',
                'type': 'daily',
                'date_label': path.stem,
                'word_count': len(text.split()),
                'char_count': len(text),
                'modified': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                'summary': _first_meaningful_line(text),
            })

    return {'agent_id': agent_id, 'workspace': workspace_dir, 'files': files}


@app.get('/api/oc/memory/file')
def oc_memory_file(path: str, agent_id: str = 'main') -> dict:
    """Read a specific memory file's content."""
    # Determine workspace for this agent
    agents_result = run_openclaw_command(['agents', 'list', '--json'])
    workspace_dir = str(WORKSPACE_ROOT)
    if agents_result.ok:
        agents = json.loads(agents_result.stdout)
        for agent in agents:
            if agent.get('id') == agent_id and agent.get('workspace'):
                workspace_dir = agent['workspace']
                break

    workspace_path = Path(workspace_dir)

    # Security: only allow MEMORY.md and memory/*.md
    safe_prefixes = ('MEMORY.md', 'memory/')
    if not any(path.startswith(p) for p in safe_prefixes):
        raise HTTPException(status_code=403, detail='Path not allowed — only MEMORY.md and memory/*.md')

    file_path = workspace_path / path
    resolved = file_path.resolve()
    if not str(resolved).startswith(str(workspace_path.resolve())):
        raise HTTPException(status_code=403, detail='Path traversal not allowed')

    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')

    text = file_path.read_text(encoding='utf-8')
    return {
        'path': path,
        'agent_id': agent_id,
        'content': text,
        'word_count': len(text.split()),
        'char_count': len(text),
        'modified': datetime.fromtimestamp(file_path.stat().st_mtime, timezone.utc).isoformat(),
    }


def _first_meaningful_line(text: str) -> str:
    """Extract first non-header, non-empty line as a summary."""
    for line in text.splitlines():
        stripped = line.strip().lstrip('#').strip().strip('-').strip()
        if stripped and len(stripped) > 5:
            return stripped[:200]
    return 'Empty file'


@app.get('/api/agent-profiles', response_model=list[AgentProfileRecord])
def list_agent_profiles() -> list[AgentProfileRecord]:
    with connect_db() as conn:
        rows = conn.execute('SELECT * FROM agent_profiles ORDER BY id ASC').fetchall()
    return [row_to_agent_profile(row) for row in rows]


@app.post('/api/agent-profiles', response_model=AgentProfileRecord)
def create_agent_profile_route(profile: AgentProfileCreate) -> AgentProfileRecord:
    return create_agent_profile(profile)


@app.put('/api/agent-profiles/{profile_id}', response_model=AgentProfileRecord)
def update_agent_profile_route(profile_id: int, profile: AgentProfileUpdate) -> AgentProfileRecord:
    return update_agent_profile(profile_id, profile)


@app.delete('/api/agent-profiles/{profile_id}')
def delete_agent_profile_route(profile_id: int) -> dict[str, bool]:
    delete_agent_profile(profile_id)
    return {'ok': True}


def build_system_prompt(profile: AgentProfileRecord) -> str:
    parts = [f'You are {profile.name}.']
    if profile.role:
        parts.append(f'Your role: {profile.role}.')
    if profile.purpose:
        parts.append(f'Your purpose: {profile.purpose}')
    if profile.capability:
        parts.append(f'Your capabilities: {profile.capability}')
    if profile.notes:
        parts.append(f'Additional context: {profile.notes}')
    return ' '.join(parts)


def get_chat_history(profile_id: int, limit: int = 50) -> list[ChatMessageRecord]:
    with connect_db() as conn:
        rows = conn.execute(
            'SELECT * FROM chat_messages WHERE profile_id = ? ORDER BY id ASC LIMIT ?',
            (profile_id, limit),
        ).fetchall()
    return [ChatMessageRecord(**dict(row)) for row in rows]


def save_chat_message(profile_id: int, role: str, content: str) -> ChatMessageRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        cursor = conn.execute(
            'INSERT INTO chat_messages (profile_id, role, content, created_at) VALUES (?, ?, ?, ?)',
            (profile_id, role, content, now),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM chat_messages WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return ChatMessageRecord(**dict(row))


ANTHROPIC_PREFIXES = ('claude-',)
OPENAI_PREFIXES = ('gpt-', 'o1-', 'o3-', 'o4-', 'chatgpt-')
DEFAULT_MODEL = 'claude-sonnet-4-6'

KNOWN_MODELS = [
    {'id': 'claude-sonnet-4-6', 'name': 'Claude Sonnet 4.6', 'vendor': 'anthropic'},
    {'id': 'claude-opus-4-6', 'name': 'Claude Opus 4.6', 'vendor': 'anthropic'},
    {'id': 'claude-haiku-4-5-20251001', 'name': 'Claude Haiku 4.5', 'vendor': 'anthropic'},
    {'id': 'gpt-4o', 'name': 'GPT-4o', 'vendor': 'openai'},
    {'id': 'gpt-4.1', 'name': 'GPT-4.1', 'vendor': 'openai'},
    {'id': 'gpt-4.1-mini', 'name': 'GPT-4.1 Mini', 'vendor': 'openai'},
    {'id': 'o4-mini', 'name': 'o4-mini', 'vendor': 'openai'},
]


def detect_vendor(model: str) -> str:
    lower = model.lower()
    if any(lower.startswith(p) for p in ANTHROPIC_PREFIXES):
        return 'anthropic'
    if any(lower.startswith(p) for p in OPENAI_PREFIXES):
        return 'openai'
    return 'openai'


def resolve_model(preferred: str | None) -> tuple[str, str]:
    model = preferred or DEFAULT_MODEL
    vendor = detect_vendor(model)
    return model, vendor


def stream_anthropic(model: str, system_prompt: str, messages: list[dict]):
    client = anthropic.Anthropic()
    chat_messages = [m for m in messages if m['role'] != 'system']
    with client.messages.stream(
        model=model,
        system=system_prompt,
        messages=chat_messages,
        max_tokens=4096,
    ) as stream:
        for text in stream.text_stream:
            yield text


def stream_openai(model: str, messages: list[dict]):
    client = openai.OpenAI()
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        max_tokens=4096,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content


@app.get('/api/models')
def list_models() -> list[dict]:
    return KNOWN_MODELS


@app.get('/api/agent-profiles/{profile_id}/chat', response_model=list[ChatMessageRecord])
def list_chat_messages(profile_id: int) -> list[ChatMessageRecord]:
    with connect_db() as conn:
        profile = conn.execute('SELECT * FROM agent_profiles WHERE id = ?', (profile_id,)).fetchone()
    if profile is None:
        raise HTTPException(status_code=404, detail='Agent profile not found')
    return get_chat_history(profile_id)


@app.post('/api/agent-profiles/{profile_id}/chat')
def send_chat_message(profile_id: int, body: ChatRequest):
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM agent_profiles WHERE id = ?', (profile_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Agent profile not found')
    profile = row_to_agent_profile(row)

    save_chat_message(profile_id, 'user', body.message)

    history = get_chat_history(profile_id)
    system_prompt = build_system_prompt(profile)
    messages = [{'role': 'system', 'content': system_prompt}]
    for msg in history:
        messages.append({'role': msg.role, 'content': msg.content})

    model, vendor = resolve_model(profile.preferred_model)

    def stream_response():
        collected = []
        try:
            if vendor == 'anthropic':
                token_stream = stream_anthropic(model, system_prompt, messages)
            else:
                token_stream = stream_openai(model, messages)

            for token in token_stream:
                collected.append(token)
                yield f'data: {json.dumps({"token": token})}\n\n'

            full_response = ''.join(collected)
            saved = save_chat_message(profile_id, 'assistant', full_response)
            yield f'data: {json.dumps({"done": True, "message": saved.model_dump()})}\n\n'
        except (openai.APIError, anthropic.APIError) as exc:
            yield f'data: {json.dumps({"error": str(exc)})}\n\n'

    return StreamingResponse(stream_response(), media_type='text/event-stream')


@app.delete('/api/agent-profiles/{profile_id}/chat')
def clear_chat_history(profile_id: int) -> dict[str, bool]:
    with connect_db() as conn:
        profile = conn.execute('SELECT * FROM agent_profiles WHERE id = ?', (profile_id,)).fetchone()
        if profile is None:
            raise HTTPException(status_code=404, detail='Agent profile not found')
        conn.execute('DELETE FROM chat_messages WHERE profile_id = ?', (profile_id,))
        conn.commit()
    return {'ok': True}
