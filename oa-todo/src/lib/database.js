/**
 * SQLite 数据库操作模块
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { TODO_STATUS, TODO_TYPE } = require('../config');

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * 初始化数据库连接
   */
  async init() {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          this.createTables()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  }

  /**
   * 创建表
   */
  async createTables() {
    const createTodosTable = `
      CREATE TABLE IF NOT EXISTS todos (
        fd_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        href TEXT NOT NULL,
        todo_type TEXT DEFAULT 'unknown',
        status TEXT DEFAULT 'pending',
        action TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        synced_at TEXT,
        processed_at TEXT,
        detail_path TEXT,
        snapshot_path TEXT,
        screenshot_path TEXT,
        source_dept TEXT,
        submitter TEXT,
        comment TEXT,
        raw_data TEXT,
        received_at TEXT
      )
    `;

    const createLogsTable = `
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fd_id TEXT,
        action TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        comment TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)',
      'CREATE INDEX IF NOT EXISTS idx_todos_type ON todos(todo_type)',
      'CREATE INDEX IF NOT EXISTS idx_todos_synced ON todos(synced_at)',
      'CREATE INDEX IF NOT EXISTS idx_todos_received_at ON todos(received_at)',
      'CREATE INDEX IF NOT EXISTS idx_logs_fd_id ON logs(fd_id)'
    ];

    await this.run(createTodosTable);
    await this.run(createLogsTable);
    
    for (const indexSql of createIndexes) {
      await this.run(indexSql);
    }
  }

  /**
   * 执行 SQL
   */
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * 查询单条
   */
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * 查询多条
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 添加或更新待办
   */
  async upsertTodo(todo) {
    const sql = `
      INSERT INTO todos (fd_id, title, href, todo_type, status, source_dept, submitter, synced_at, raw_data, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
      ON CONFLICT(fd_id) DO UPDATE SET
        title = excluded.title,
        href = excluded.href,
        todo_type = excluded.todo_type,
        source_dept = excluded.source_dept,
        submitter = excluded.submitter,
        synced_at = datetime('now', 'localtime'),
        raw_data = excluded.raw_data,
        received_at = excluded.received_at,
        updated_at = datetime('now', 'localtime')
    `;

    return this.run(sql, [
      todo.fd_id,
      todo.title,
      todo.href,
      todo.todo_type || TODO_TYPE.UNKNOWN,
      todo.status || TODO_STATUS.PENDING,
      todo.source_dept,
      todo.submitter,
      todo.raw_data ? JSON.stringify(todo.raw_data) : null,
      todo.received_at || null
    ]);
  }

  /**
   * 获取待办
   */
  async getTodo(fdId) {
    const sql = 'SELECT * FROM todos WHERE fd_id = ?';
    return this.get(sql, [fdId]);
  }

  /**
   * 通过fdId前缀获取待办（支持部分ID查询）
   */
  async getTodoByPrefix(fdIdPrefix) {
    // 先尝试精确匹配
    let todo = await this.getTodo(fdIdPrefix);
    
    if (todo) return todo;
    
    // 如果没有精确匹配，尝试前缀匹配
    const sql = 'SELECT * FROM todos WHERE fd_id LIKE ? LIMIT 1';
    return this.get(sql, [`${fdIdPrefix}%`]);
  }

  /**
   * 获取待办列表
   */
  async getTodos(filters = {}) {
    let sql = 'SELECT * FROM todos WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.type) {
      sql += ' AND todo_type = ?';
      params.push(filters.type);
    }

    // 支持按接收时间或创建时间排序
    const orderBy = filters.orderBy || 'created_at';
    const orderDir = filters.orderDir || 'DESC';
    sql += ` ORDER BY ${orderBy} ${orderDir}`;

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.all(sql, params);
  }

  /**
   * 更新状态
   */
  async updateStatus(fdId, status, action, comment = null) {
    const todo = await this.getTodo(fdId);
    const oldStatus = todo ? todo.status : null;

    // 更新待办状态
    const updateSql = `
      UPDATE todos 
      SET status = ?, 
          action = ?, 
          comment = ?,
          processed_at = datetime('now', 'localtime'),
          updated_at = datetime('now', 'localtime')
      WHERE fd_id = ?
    `;

    await this.run(updateSql, [status, action, comment, fdId]);

    // 记录日志
    const logSql = `
      INSERT INTO logs (fd_id, action, old_status, new_status, comment)
      VALUES (?, ?, ?, ?, ?)
    `;

    await this.run(logSql, [fdId, action, oldStatus, status, comment]);
  }

  /**
   * 更新详情路径
   */
  async updateDetailPaths(fdId, detailPath, snapshotPath, screenshotPath) {
    const sql = `
      UPDATE todos 
      SET detail_path = ?,
          snapshot_path = ?,
          screenshot_path = ?,
          updated_at = datetime('now', 'localtime')
      WHERE fd_id = ?
    `;

    return this.run(sql, [detailPath, snapshotPath, screenshotPath, fdId]);
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    const stats = {};

    // 总数
    stats.total = (await this.get('SELECT COUNT(*) as count FROM todos')).count;

    // 按状态统计
    const statusStats = await this.all(`
      SELECT status, COUNT(*) as count 
      FROM todos 
      GROUP BY status
    `);
    stats.byStatus = {};
    statusStats.forEach(item => {
      stats.byStatus[item.status] = item.count;
    });

    // 按类型统计
    const typeStats = await this.all(`
      SELECT todo_type, COUNT(*) as count 
      FROM todos 
      GROUP BY todo_type
    `);
    stats.byType = {};
    typeStats.forEach(item => {
      stats.byType[item.todo_type] = item.count;
    });

    // 按日期统计（最近7天）
    const dateStats = await this.all(`
      SELECT date(created_at) as date, COUNT(*) as count 
      FROM todos 
      WHERE created_at >= date('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date DESC
    `);
    stats.byDate = dateStats;

    return stats;
  }

  /**
   * 获取待办总数
   */
  async getTodoCount() {
    const result = await this.get('SELECT COUNT(*) as count FROM todos');
    return result ? result.count : 0;
  }

  /**
   * 清理数据
   */
  async clean(options = {}) {
    let sql = 'DELETE FROM todos WHERE 1=1';
    const params = [];

    if (options.days) {
      sql += ` AND created_at < datetime('now', ?)`;
      params.push(`-${options.days} days`);
    }

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options.all) {
      sql = 'DELETE FROM todos';
      params.length = 0;
    }

    const result = await this.run(sql, params);
    
    // 同时清理日志
    await this.run('DELETE FROM logs WHERE fd_id NOT IN (SELECT fd_id FROM todos)');

    return result.changes;
  }

  /**
   * 关闭连接
   */
  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

module.exports = Database;
