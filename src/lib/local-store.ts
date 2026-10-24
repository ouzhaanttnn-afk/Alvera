import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config';
import type { Store, SubmitInput, Filters } from './db';
import {
  transitions,
  type Application,
  type Document,
  type History,
  type Outbox,
  type Status,
} from './types';
export class LocalStore implements Store {
  db: DatabaseSync;
  constructor(path?: string) {
    const c = config();
    if (!c.local) throw new Error('LOCAL_FORBIDDEN');
    mkdirSync(c.dataDir, { recursive: true });
    this.db = new DatabaseSync(path || join(c.dataDir, 'nostos.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL, masked_identity TEXT NOT NULL, payload TEXT NOT NULL, intake_id TEXT UNIQUE NOT NULL, deletion_requested_at TEXT, notice_version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS application_documents(id TEXT PRIMARY KEY, application_id TEXT REFERENCES applications(id) ON DELETE CASCADE, intake_id TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS application_signatures(document_id TEXT PRIMARY KEY REFERENCES application_documents(id) ON DELETE CASCADE, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS application_status_history(id TEXT PRIMARY KEY,application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,created_at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,status TEXT,note TEXT);
      CREATE TABLE IF NOT EXISTS admin_users(id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,application_id TEXT,created_at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notification_outbox(id TEXT PRIMARY KEY,application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,audience TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL,lease_until TEXT,last_error TEXT,created_at TEXT NOT NULL,UNIQUE(application_id,audience));
      CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS counters(year INTEGER PRIMARY KEY,value INTEGER NOT NULL);`);
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async submit(v: SubmitInput) {
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM applications WHERE intake_id=?').get(v.intake) as
        Application | undefined;
      if (old) return old;
      const docs = v.documents.map(
        (id) =>
          this.db
            .prepare(
              'SELECT * FROM application_documents WHERE id=? AND intake_id=? AND application_id IS NULL',
            )
            .get(id, v.intake) as Document | undefined,
      );
      if (docs.some((d) => !d) || new Set(docs.map((d) => d!.kind)).size !== docs.length)
        throw new Error('INVALID_DOCUMENT');
      const year = new Date().getUTCFullYear();
      this.db
        .prepare('INSERT INTO counters VALUES(?,1) ON CONFLICT(year) DO UPDATE SET value=value+1')
        .run(year);
      const count = this.db.prepare('SELECT value FROM counters WHERE year=?').get(year) as {
        value: number;
      };
      const a: Application = {
        id: v.id,
        reference: `NF-${year}-${String(count.value).padStart(6, '0')}`,
        created_at: new Date().toISOString(),
        status: 'SUBMITTED',
        kind: v.kind as Application['kind'],
        masked_identity: v.masked,
        payload: v.payload,
        intake_id: v.intake,
        deletion_requested_at: null,
        notice_version: v.notice,
      };
      this.db
        .prepare('INSERT INTO applications VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(
          a.id,
          a.reference,
          a.created_at,
          a.status,
          a.kind,
          a.masked_identity,
          a.payload,
          a.intake_id,
          null,
          a.notice_version,
        );
      for (const doc of docs) {
        this.db
          .prepare('UPDATE application_documents SET application_id=? WHERE id=?')
          .run(a.id, doc!.id);
        if (doc!.kind === 'signature')
          this.db.prepare('INSERT INTO application_signatures VALUES(?,?)').run(doc!.id, a.id);
      }
      this.record(a.id, 'applicant', 'SUBMITTED', 'SUBMITTED', null);
      for (const audience of v.receipt ? ['admin', 'applicant'] : ['admin'])
        this.db
          .prepare("INSERT INTO notification_outbox VALUES(?,?,?,'pending',0,?,NULL,NULL,?)")
          .run(randomUUID(), a.id, audience, a.created_at, a.created_at);
      return a;
    });
  }
  async list(f: Filters) {
    return this.db
      .prepare(
        `SELECT * FROM applications WHERE reference LIKE ? AND (?='' OR status=?) AND created_at>=? AND created_at<=? ORDER BY created_at DESC LIMIT 50 OFFSET ?`,
      )
      .all(
        `${f.reference || ''}%`,
        f.status || '',
        f.status || '',
        f.from || '',
        f.to ? `${f.to}T23:59:59.999Z` : '9999',
        ((f.page || 1) - 1) * 50,
      ) as Application[];
  }
  async get(id: string) {
    return (
      (this.db.prepare('SELECT * FROM applications WHERE id=?').get(id) as Application) || null
    );
  }
  async byIntake(id: string) {
    return (
      (this.db.prepare('SELECT * FROM applications WHERE intake_id=?').get(id) as Application) ||
      null
    );
  }
  async addDocument(d: Document) {
    this.transaction(() => {
      if (this.db.prepare('SELECT id FROM applications WHERE intake_id=?').get(d.intake_id))
        throw new Error('ALREADY_SUBMITTED');
      this.db
        .prepare('INSERT INTO application_documents VALUES(?,?,?,?,?,?,?,?)')
        .run(d.id, d.application_id, d.intake_id, d.kind, d.path, d.mime, d.size, d.created_at);
    });
  }
  async documents(id: string) {
    return this.db
      .prepare('SELECT * FROM application_documents WHERE application_id=?')
      .all(id) as Document[];
  }
  async document(id: string) {
    return (
      (this.db.prepare('SELECT * FROM application_documents WHERE id=?').get(id) as Document) ||
      null
    );
  }
  async history(id: string) {
    return this.db
      .prepare(
        'SELECT * FROM application_status_history WHERE application_id=? ORDER BY created_at DESC',
      )
      .all(id) as History[];
  }
  async outbox(id: string) {
    return this.db
      .prepare('SELECT * FROM notification_outbox WHERE application_id=?')
      .all(id) as Outbox[];
  }
  private record(
    id: string,
    actor: string,
    action: string,
    status: Status | null,
    note: string | null,
  ) {
    this.db
      .prepare('INSERT INTO application_status_history VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), id, new Date().toISOString(), actor, action, status, note);
    this.auditSync(id, actor, action);
  }
  async change(id: string, actor: string, status: Status, note: string) {
    this.transaction(() => {
      const a = this.db.prepare('SELECT status FROM applications WHERE id=?').get(id) as
        Application | undefined;
      if (!a || !transitions[a.status].includes(status)) throw new Error('INVALID_TRANSITION');
      this.db.prepare('UPDATE applications SET status=? WHERE id=?').run(status, id);
      this.record(id, actor, 'STATUS_CHANGED', status, note || null);
    });
  }
  async note(id: string, actor: string, note: string) {
    this.record(id, actor, 'NOTE_ADDED', null, note);
  }
  private auditSync(id: string, actor: string, action: string) {
    this.db
      .prepare('INSERT INTO audit_logs VALUES(?,?,?,?,?)')
      .run(randomUUID(), id, new Date().toISOString(), actor, action);
  }
  async audit(id: string, actor: string, action: string) {
    this.auditSync(id, actor, action);
  }
  async deletion(id: string, actor: string, execute: boolean) {
    this.transaction(() => {
      const a = this.db.prepare('SELECT * FROM applications WHERE id=?').get(id) as
        Application | undefined;
      if (!a || (execute && !a.deletion_requested_at)) throw new Error('DELETION_NOT_REQUESTED');
      this.auditSync(id, actor, execute ? 'DELETED' : 'DELETION_REQUESTED');
      if (execute) this.db.prepare('DELETE FROM applications WHERE id=?').run(id);
      else {
        this.db
          .prepare('UPDATE applications SET deletion_requested_at=? WHERE id=?')
          .run(new Date().toISOString(), id);
        this.record(id, actor, 'DELETION_REQUESTED', null, null);
      }
    });
  }
  async claim() {
    return this.transaction(() => {
      const now = new Date().toISOString(),
        lease = new Date(Date.now() + 300000).toISOString();
      const rows = this.db
        .prepare(
          "SELECT * FROM notification_outbox WHERE attempts<8 AND created_at>? AND ((state IN ('pending','failed') AND next_attempt_at<=?) OR (state='processing' AND lease_until<?)) LIMIT 20",
        )
        .all(new Date(Date.now() - 23 * 3600000).toISOString(), now, now) as Outbox[];
      for (const row of rows) {
        this.db
          .prepare(
            "UPDATE notification_outbox SET state='processing',attempts=attempts+1,lease_until=? WHERE id=?",
          )
          .run(lease, row.id);
        row.attempts++;
        row.lease_until = lease;
        row.state = 'processing';
      }
      return rows;
    });
  }
  async finish(id: string, lease: string, success: boolean) {
    const row = this.db.prepare('SELECT attempts FROM notification_outbox WHERE id=?').get(id) as
      Outbox | undefined;
    if (!row) return;
    this.db
      .prepare(
        'UPDATE notification_outbox SET state=?,last_error=?,next_attempt_at=?,lease_until=NULL WHERE id=? AND lease_until=?',
      )
      .run(
        success ? 'sent' : 'failed',
        success ? null : 'DELIVERY_FAILED',
        new Date(Date.now() + Math.min(3600, 30 * 2 ** row.attempts) * 1000).toISOString(),
        id,
        lease,
      );
  }
  async rate(key: string, limit: number, seconds: number) {
    return this.transaction(() => {
      const now = Math.floor(Date.now() / 1000);
      this.db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);
      this.db
        .prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1')
        .run(key, now + seconds);
      return (
        (this.db.prepare('SELECT hits FROM rate_limits WHERE key=?').get(key) as { hits: number })
          .hits <= limit
      );
    });
  }
  async orphaned(before: string) {
    return this.db
      .prepare(
        'SELECT * FROM application_documents WHERE application_id IS NULL AND created_at<? LIMIT 200',
      )
      .all(before) as Document[];
  }
  async deleteDocument(id: string) {
    this.db
      .prepare('DELETE FROM application_documents WHERE id=? AND application_id IS NULL')
      .run(id);
  }
  async expired(before: string) {
    return this.db
      .prepare(
        'SELECT * FROM applications WHERE created_at<? AND deletion_requested_at IS NULL LIMIT 100',
      )
      .all(before) as Application[];
  }
}
