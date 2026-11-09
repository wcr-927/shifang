import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export class DatabaseConnection {
  readonly db: Database.Database;
  readonly backupPath: string | null;

  constructor(databasePath: string, migrationsDirectory: string) {
    const existing = existsSync(databasePath) && statSync(databasePath).size > 0;
    this.db = new Database(databasePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    try { this.backupPath = this.applyMigrations(migrationsDirectory, existing ? databasePath : null); }
    catch (error) { this.db.close(); throw error; }
  }

  private applyMigrations(migrationsDirectory: string, existingPath: string | null): string | null {
    if (!existsSync(migrationsDirectory)) {
      throw new Error(`database migrations directory not found: ${migrationsDirectory}`);
    }
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const applied = new Set(
      this.db.prepare("SELECT version FROM schema_migrations").all().map((row) => (row as { version: number }).version),
    );
    const migrations = readdirSync(migrationsDirectory)
      .filter((file) => /^\d+_.+\.sql$/u.test(file))
      .sort();
    const pending = migrations.filter(migration => !applied.has(Number(migration.split("_", 1)[0])));
    if (!pending.length) return null;
    const backup = existingPath ? `${existingPath}.backup-v${Math.max(0, ...applied)}-${Date.now()}-${randomUUID().slice(0,8)}.sqlite` : null;
    // VACUUM INTO includes committed WAL data in a self-contained, consistent backup.
    if (backup) this.db.prepare("VACUUM INTO ?").run(backup);
    this.db.pragma("foreign_keys = OFF");
    try {
      this.db.transaction(() => {
        for (const migration of pending) {
          this.db.exec(readFileSync(join(migrationsDirectory, migration), "utf8"));
          this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(Number(migration.split("_", 1)[0]), new Date().toISOString());
        }
        const foreignKeyViolations = this.db.pragma("foreign_key_check");
        if (!Array.isArray(foreignKeyViolations) || foreignKeyViolations.length > 0) {
          throw new Error("迁移后的关联数据检查失败");
        }
      })();
    } catch (error) {
      throw new Error(`数据库升级未完成，事务已回滚。${backup ? `升级前备份：${backup}。` : ""}${error instanceof Error ? error.message : String(error)}`);
    } finally { this.db.pragma("foreign_keys = ON"); }
    return backup;
  }

  close(): void {
    this.db.close();
  }
}

export function defaultMigrationsDirectory(isPackaged: boolean, resourcesPath: string): string {
  if (isPackaged) return join(resourcesPath, "app.asar", "electron", "database", "migrations");
  return join(process.cwd(), "electron", "database", "migrations");
}
