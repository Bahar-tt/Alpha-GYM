/** sqlite-wrapper.js — better-sqlite3 if installed, else node:sqlite */
let Database;

try {
  Database = require('better-sqlite3');
} catch (_err) {
  const { DatabaseSync } = require('node:sqlite');

  class Statement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
    }

    run(...params) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const stmt = this.db.prepare(this.sql);
      const result = stmt.run(...flat.map((v) => (v === undefined ? null : v)));
      return {
        changes: Number(result.changes),
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    }

    get(...params) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const stmt = this.db..prepare(this.sql);
      return stmt.get(...flat.map((v) => (v === undefined ? null : v)));
    }

    all(...params) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const stmt = this.db.prepare(this.sql);
      return stmt.all(...flat.map((v) => (v === undefined ? null : v)));
    }
  }

  class DatabaseClass {
    constructor(path) {
      this.db = new DatabaseSync(path);
    }

    prepare(sql) {
      return new Statement(this.db, sql);
    }

    exec(sql) {
      this.db.exec(sql);
    }

    transaction(fn) {
      return (...args) => {
        this.db.exec('BEGIN');
        try {
          const result = fn(...args);
          this.db.exec('COMMIT');
          return result;
        } catch (e) {
          this.db.exec('ROLLBACK');
          throw e;
        }
      };
    }

    close() {
      this.db.close();
    }
  }

  Database = DatabaseClass;
}

module.exports = Database;
