from __future__ import annotations

import contextlib
import hashlib
import json
import os
import sqlite3
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.error import URLError
from urllib.request import urlopen

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
TaskType = Literal['manual', 'shell', 'python', 'web_fetch']
TaskStatus = Literal['queued', 'running', 'success', 'failed', 'paused']

scheduler_stop_event = threading.Event()
scheduler_thread: threading.Thread | None = None


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


class TaskBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    task_type: TaskType
    enabled: bool = True
    interval_minutes: int | None = Field(default=None, ge=1, le=10080)
    command: str | None = None
    working_directory: str | None = None
    target_url: str | None = None
    notes: str | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    task_type: TaskType | None = None
    enabled: bool | None = None
    interval_minutes: int | None = Field(default=None, ge=1, le=10080)
    command: str | None = None
    working_directory: str | None = None
    target_url: str | None = None
    notes: str | None = None


class TaskRecord(TaskBase):
    id: int
    created_at: str
    updated_at: str
    last_run_at: str | None
    next_run_at: str | None
    last_status: TaskStatus | None
    last_output: str | None


class TaskRunRecord(BaseModel):
    id: int
    task_id: int
    started_at: str
    finished_at: str | None
    status: TaskStatus
    output: str
    error: str | None
    duration_ms: int | None


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

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                task_type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                interval_minutes INTEGER,
                command TEXT,
                working_directory TEXT,
                target_url TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_run_at TEXT,
                next_run_at TEXT,
                last_status TEXT,
                last_output TEXT
            );

            CREATE TABLE IF NOT EXISTS task_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL,
                output TEXT NOT NULL,
                error TEXT,
                duration_ms INTEGER,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
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
        seed_tasks(conn)
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


def seed_tasks(conn: sqlite3.Connection) -> None:
    existing = conn.execute('SELECT COUNT(*) AS count FROM tasks').fetchone()
    if existing and existing['count'] > 0:
        return

    now = utc_now_iso()
    seeds = [
        {
            'name': 'Poll OpenAI usage',
            'task_type': 'web_fetch',
            'enabled': 0,
            'interval_minutes': 10,
            'command': None,
            'working_directory': None,
            'target_url': 'https://status.openai.com/',
            'notes': 'Placeholder poll task for compute/usage visibility.',
        },
        {
            'name': 'Re-ingest memory files',
            'task_type': 'python',
            'enabled': 0,
            'interval_minutes': 30,
            'command': "from urllib.request import urlopen; print(urlopen('http://127.0.0.1:8000/api/memory').read().decode())",
            'working_directory': str(PROJECT_ROOT),
            'target_url': None,
            'notes': 'Placeholder until dedicated internal trigger exists.',
        },
        {
            'name': 'Fetch reference page',
            'task_type': 'shell',
            'enabled': 0,
            'interval_minutes': None,
            'command': 'curl -I https://docs.openclaw.ai',
            'working_directory': str(PROJECT_ROOT),
            'target_url': None,
            'notes': 'Simple connectivity and content fetch example.',
        },
    ]

    for seed in seeds:
        conn.execute(
            '''
            INSERT INTO tasks (
                name, task_type, enabled, interval_minutes, command, working_directory,
                target_url, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                seed['name'],
                seed['task_type'],
                seed['enabled'],
                seed['interval_minutes'],
                seed['command'],
                seed['working_directory'],
                seed['target_url'],
                seed['notes'],
                now,
                now,
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


def row_to_task(row: sqlite3.Row) -> TaskRecord:
    return TaskRecord(
        id=row['id'],
        name=row['name'],
        task_type=row['task_type'],
        enabled=bool(row['enabled']),
        interval_minutes=row['interval_minutes'],
        command=row['command'],
        working_directory=row['working_directory'],
        target_url=row['target_url'],
        notes=row['notes'],
        created_at=row['created_at'],
        updated_at=row['updated_at'],
        last_run_at=row['last_run_at'],
        next_run_at=row['next_run_at'],
        last_status=row['last_status'],
        last_output=row['last_output'],
    )


def row_to_task_run(row: sqlite3.Row) -> TaskRunRecord:
    return TaskRunRecord(**dict(row))


def compute_next_run(task: TaskRecord | sqlite3.Row | dict) -> str | None:
    if isinstance(task, sqlite3.Row) or isinstance(task, dict):
        interval = task['interval_minutes']
        enabled = bool(task['enabled'])
    else:
        interval = task.interval_minutes
        enabled = task.enabled
    if not enabled or not interval:
        return None
    return datetime.fromtimestamp(time.time() + (interval * 60), timezone.utc).isoformat()


def create_task_record(payload: TaskCreate) -> TaskRecord:
    now = utc_now_iso()
    with connect_db() as conn:
        cursor = conn.execute(
            '''
            INSERT INTO tasks (
                name, task_type, enabled, interval_minutes, command, working_directory,
                target_url, notes, created_at, updated_at, next_run_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                payload.name,
                payload.task_type,
                int(payload.enabled),
                payload.interval_minutes,
                payload.command,
                payload.working_directory,
                payload.target_url,
                payload.notes,
                now,
                now,
                datetime.fromtimestamp(time.time() + payload.interval_minutes * 60, timezone.utc).isoformat()
                if payload.enabled and payload.interval_minutes
                else None,
            ),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return row_to_task(row)


def update_task_record(task_id: int, payload: TaskUpdate) -> TaskRecord:
    with connect_db() as conn:
        existing = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail='Task not found')

        updated = dict(existing)
        for key, value in payload.model_dump(exclude_unset=True).items():
            updated[key] = value
        updated['enabled'] = int(bool(updated['enabled']))
        updated['updated_at'] = utc_now_iso()
        updated['next_run_at'] = compute_next_run(updated)

        conn.execute(
            '''
            UPDATE tasks
            SET name = :name,
                task_type = :task_type,
                enabled = :enabled,
                interval_minutes = :interval_minutes,
                command = :command,
                working_directory = :working_directory,
                target_url = :target_url,
                notes = :notes,
                updated_at = :updated_at,
                next_run_at = :next_run_at
            WHERE id = :id
            ''',
            updated,
        )
        conn.commit()
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    return row_to_task(row)


def delete_task_record(task_id: int) -> None:
    with connect_db() as conn:
        cursor = conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        conn.execute('DELETE FROM task_runs WHERE task_id = ?', (task_id,))
        conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail='Task not found')


def execute_task(task_id: int) -> TaskRunRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Task not found')

        task = row_to_task(row)
        started_at = utc_now()
        conn.execute(
            'UPDATE tasks SET last_status = ?, updated_at = ? WHERE id = ?',
            ('running', started_at.isoformat(), task_id),
        )
        conn.commit()

    status: TaskStatus = 'success'
    output = ''
    error: str | None = None

    try:
        if task.task_type == 'manual':
            output = task.notes or 'Manual task marked as run.'
        elif task.task_type == 'shell':
            if not task.command:
                raise RuntimeError('Shell task missing command')
            result = subprocess.run(
                task.command,
                shell=True,
                cwd=task.working_directory or str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=120,
                env={**os.environ, 'PYTHONUNBUFFERED': '1'},
            )
            output = (result.stdout or '') + (('\n' + result.stderr) if result.stderr else '')
            if result.returncode != 0:
                raise RuntimeError(f'Command exited with code {result.returncode}')
        elif task.task_type == 'python':
            if not task.command:
                raise RuntimeError('Python task missing code')
            result = subprocess.run(
                ['python3', '-c', task.command],
                cwd=task.working_directory or str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=120,
                env={**os.environ, 'PYTHONUNBUFFERED': '1'},
            )
            output = (result.stdout or '') + (('\n' + result.stderr) if result.stderr else '')
            if result.returncode != 0:
                raise RuntimeError(f'Python exited with code {result.returncode}')
        elif task.task_type == 'web_fetch':
            if not task.target_url:
                raise RuntimeError('Web fetch task missing target_url')
            with urlopen(task.target_url, timeout=30) as response:
                body = response.read(4000).decode('utf-8', errors='replace')
                output = body[:4000]
        else:
            raise RuntimeError(f'Unsupported task type: {task.task_type}')
    except (subprocess.TimeoutExpired, URLError, RuntimeError, OSError) as exc:
        status = 'failed'
        error = str(exc)
        if not output:
            output = error

    finished_at = utc_now()
    duration_ms = int((finished_at - started_at).total_seconds() * 1000)
    next_run_at = compute_next_run(task)

    with connect_db() as conn:
        cursor = conn.execute(
            '''
            INSERT INTO task_runs (task_id, started_at, finished_at, status, output, error, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''',
            (task_id, started_at.isoformat(), finished_at.isoformat(), status, output[:12000], error, duration_ms),
        )
        conn.execute(
            '''
            UPDATE tasks
            SET last_run_at = ?,
                next_run_at = ?,
                last_status = ?,
                last_output = ?,
                updated_at = ?
            WHERE id = ?
            ''',
            (
                finished_at.isoformat(),
                next_run_at,
                status,
                output[:4000],
                finished_at.isoformat(),
                task_id,
            ),
        )
        conn.commit()
        run_row = conn.execute('SELECT * FROM task_runs WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return row_to_task_run(run_row)


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


def scheduler_loop() -> None:
    while not scheduler_stop_event.is_set():
        try:
            now_iso = utc_now_iso()
            with connect_db() as conn:
                due_tasks = conn.execute(
                    '''
                    SELECT * FROM tasks
                    WHERE enabled = 1
                      AND interval_minutes IS NOT NULL
                      AND next_run_at IS NOT NULL
                      AND next_run_at <= ?
                      AND (last_status IS NULL OR last_status != 'running')
                    ORDER BY next_run_at ASC
                    LIMIT 5
                    ''',
                    (now_iso,),
                ).fetchall()
            for row in due_tasks:
                execute_task(row['id'])
        except Exception:
            pass
        scheduler_stop_event.wait(10)


def ensure_scheduler() -> None:
    global scheduler_thread
    if scheduler_thread and scheduler_thread.is_alive():
        return
    scheduler_stop_event.clear()
    scheduler_thread = threading.Thread(target=scheduler_loop, daemon=True, name='cc-task-scheduler')
    scheduler_thread.start()


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
    ensure_scheduler()


@app.on_event('shutdown')
def shutdown() -> None:
    scheduler_stop_event.set()
    with contextlib.suppress(Exception):
        if scheduler_thread and scheduler_thread.is_alive():
            scheduler_thread.join(timeout=2)


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


@app.get('/api/tasks', response_model=list[TaskRecord])
def list_tasks() -> list[TaskRecord]:
    with connect_db() as conn:
        rows = conn.execute('SELECT * FROM tasks ORDER BY id DESC').fetchall()
    return [row_to_task(row) for row in rows]


@app.get('/api/tasks/{task_id}', response_model=TaskRecord)
def get_task(task_id: int) -> TaskRecord:
    with connect_db() as conn:
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Task not found')
    return row_to_task(row)


@app.post('/api/tasks', response_model=TaskRecord)
def create_task(task: TaskCreate) -> TaskRecord:
    return create_task_record(task)


@app.put('/api/tasks/{task_id}', response_model=TaskRecord)
def update_task(task_id: int, task: TaskUpdate) -> TaskRecord:
    return update_task_record(task_id, task)


@app.delete('/api/tasks/{task_id}')
def delete_task(task_id: int) -> dict[str, bool]:
    delete_task_record(task_id)
    return {'ok': True}


@app.post('/api/tasks/{task_id}/run', response_model=TaskRunRecord)
def run_task(task_id: int) -> TaskRunRecord:
    return execute_task(task_id)


@app.get('/api/tasks/{task_id}/runs', response_model=list[TaskRunRecord])
def list_task_runs(task_id: int) -> list[TaskRunRecord]:
    with connect_db() as conn:
        rows = conn.execute(
            'SELECT * FROM task_runs WHERE task_id = ? ORDER BY id DESC LIMIT 20',
            (task_id,),
        ).fetchall()
    return [row_to_task_run(row) for row in rows]


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
