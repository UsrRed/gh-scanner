import BetterSqlite from 'better-sqlite3';

/** Read-only text dump of every table row of a SQLite file (for leak checks). */
export class Database {
  constructor(private file: string) {}
  dumpText(): string {
    const db = new BetterSqlite(this.file, { readonly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      return tables.map((t) => JSON.stringify(db.prepare(`SELECT * FROM "${t.name}"`).all())).join('\n');
    } finally { db.close(); }
  }
}
