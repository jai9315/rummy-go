// @ts-nocheck
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";

// @ts-nocheck

const DATABASE_URL = process.env.DATABASE_URL || "./prisma/dev.db";
const dbPath = DATABASE_URL.startsWith("file:") ? DATABASE_URL.slice(5) : DATABASE_URL;
const db = new DatabaseSync(dbPath);

// Ensure tables exist (matching Prisma schema)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  profile_image TEXT,
  is_guest INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  room_code TEXT UNIQUE NOT NULL,
  host_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  max_players INTEGER DEFAULT 6,
  status TEXT DEFAULT 'WAITING',
  password_hash TEXT,
  round_count INTEGER DEFAULT 1,
  entry_points INTEGER DEFAULT 80,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (host_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS room_players (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  is_ready INTEGER DEFAULT 0,
  connection_status TEXT DEFAULT 'CONNECTED',
  joined_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (room_id, user_id),
  UNIQUE (room_id, seat_number)
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  room_id TEXT NOT NULL,
  game_status TEXT DEFAULT 'IN_PROGRESS',
  round_number INTEGER DEFAULT 1,
  current_turn_player_id TEXT,
  wild_joker_card TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
CREATE TABLE IF NOT EXISTS game_actions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (game_id) REFERENCES games(id)
);
CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  rank INTEGER DEFAULT 1,
  is_winner INTEGER DEFAULT 0,
  has_dropped INTEGER DEFAULT 0,
  score_detail TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (game_id) REFERENCES games(id),
  FOREIGN KEY (player_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id),
  UNIQUE (sender_id, receiver_id)
);
`);

const BOOLEAN_FIELDS = new Set(["isGuest", "isReady", "isWinner", "hasDropped", "isHost"]);

function toCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    let converted = value;
    if (BOOLEAN_FIELDS.has(camelKey) && typeof value === "number") {
      converted = value === 1;
    }
    result[camelKey] = converted;
  }
  return result;
}

function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    result[snakeKey] = typeof value === "boolean" ? (value ? 1 : 0) : value;
  }
  return result;
}

function matchWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === "OR") {
      if (!Array.isArray(val) || !val.some((sub) => matchWhere(row, sub as Record<string, unknown>)))
        return false;
    } else if (key === "AND") {
      if (!Array.isArray(val) || !val.every((sub) => matchWhere(row, sub as Record<string, unknown>)))
        return false;
    } else if (key === "NOT") {
      if (!Array.isArray(val) || val.some((sub) => matchWhere(row, sub as Record<string, unknown>)))
        return false;
    } else {
      const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (row[col] !== val) return false;
    }
  }
  return true;
}

function createTableClient(tableName: string, idField = "id") {
  return {
    async findUnique(args?: { where?: Record<string, unknown>; include?: Record<string, unknown> }) {
      const { where, include } = args || {};
      const conditions: string[] = [];
      const params: unknown[] = [];
      for (const [key, val] of Object.entries(where || {})) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        conditions.push(`${col} = ?`);
        params.push(val);
      }
      const sql = `SELECT * FROM ${tableName} ${
        conditions.length ? "WHERE " + conditions.join(" AND ") : ""
      } LIMIT 1`;
      const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      if (!row) return null;
      const result = toCamel(row);
      if (where && !matchWhere(row, where)) return null;
      if (include) {
        if ((include as any).host) {
          const hostRow = db
            .prepare("SELECT * FROM users WHERE id = ?")
            .get(result.hostId) as Record<string, unknown> | undefined;
          if (hostRow) {
            const hostCamel = toCamel(hostRow);
            const hostSelect = (include as any).host.select || {};
            if (Object.keys(hostSelect).length > 0) {
              result.host = {};
              for (const selKey of Object.keys(hostSelect)) {
                (result.host as Record<string, unknown>)[selKey] = hostCamel[selKey];
              }
            } else {
              result.host = hostCamel;
            }
          }
        }
        if ((include as any).players) {
          const playerSelect = (include as any).players.include || {};
          const playerRows = db
            .prepare("SELECT * FROM room_players WHERE room_id = ?")
            .all(result.id) as Record<string, unknown>[];
          result.players = playerRows.map((rp) => {
            const rpCamel = toCamel(rp);
            if (playerSelect.user) {
              const userSelect = (playerSelect as any).user.select || {};
              const userRow = db
                .prepare("SELECT * FROM users WHERE id = ?")
                .get(rpCamel.userId) as Record<string, unknown> | undefined;
              if (userRow) {
                const userCamel = toCamel(userRow);
                if (Object.keys(userSelect).length > 0) {
                  rpCamel.user = {};
                  for (const selKey of Object.keys(userSelect)) {
                    (rpCamel.user as Record<string, unknown>)[selKey] = userCamel[selKey];
                  }
                } else {
                  rpCamel.user = userCamel;
                }
              }
            }
            return rpCamel;
          });
        }
      }
      return result;
    },
    async findFirst(args?: { where?: Record<string, unknown>; include?: Record<string, unknown> }) {
      const { where, include } = args || {};
      const simpleConditions: string[] = [];
      const params: unknown[] = [];
      for (const [key, val] of Object.entries(where || {})) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        simpleConditions.push(`${col} = ?`);
        params.push(val);
      }
      const sql = `SELECT * FROM ${tableName} ${
        simpleConditions.length ? "WHERE " + simpleConditions.join(" AND ") : ""
      }`;
      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      for (const row of rows) {
        if (!where || matchWhere(row, where)) {
          const result = toCamel(row);
          if (include) {
            if ((include as any).host) {
              const hostRow = db
                .prepare("SELECT * FROM users WHERE id = ?")
                .get(result.hostId) as Record<string, unknown> | undefined;
              if (hostRow) {
                const hostCamel = toCamel(hostRow);
                const hostSelect = (include as any).host.select || {};
                if (Object.keys(hostSelect).length > 0) {
                  result.host = {};
                  for (const selKey of Object.keys(hostSelect)) {
                    (result.host as Record<string, unknown>)[selKey] = hostCamel[selKey];
                  }
                } else {
                  result.host = hostCamel;
                }
              }
            }
          }
          return result;
        }
      }
      return null;
    },
    async findMany(args?: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, string>;
      take?: number;
      skip?: number;
    }) {
      const { where, include, orderBy, take, skip } = args || {};
      const simpleConditions: string[] = [];
      const params: unknown[] = [];
      for (const [key, val] of Object.entries(where || {})) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        simpleConditions.push(`${col} = ?`);
        params.push(val);
      }
      let sql = `SELECT * FROM ${tableName}`;
      if (simpleConditions.length) sql += " WHERE " + simpleConditions.join(" AND ");
      if (orderBy) {
        const [orderKey, orderDir] = Object.entries(orderBy)[0];
        const col = orderKey.replace(/([A-Z])/g, "_$1").toLowerCase();
        sql += ` ORDER BY ${col} ${orderDir || "ASC"}`;
      }
      if (skip !== undefined) sql += ` OFFSET ${skip}`;
      if (take !== undefined) sql += ` LIMIT ${take}`;
      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      let results = rows.map((row) => toCamel(row));
      if (where) {
        results = results.filter((r) => {
          const origRow = rows[results.indexOf(r)];
          return matchWhere(origRow, where);
        });
      }
      return results;
    },
    async create(args?: { data?: Record<string, unknown> }) {
      const { data } = args || {};
      const snakeData = toSnake(data as Record<string, unknown>);
      const id = randomUUID();
      snakeData[idField] = id;
      const fields = Object.keys(snakeData);
      const values = Object.values(snakeData);
      const sql = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`;
      db.prepare(sql).run(...values);
      return { ...data, [idField]: id };
    },
    async upsert(args?: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      const { where, create, update } = args || {};
      const simpleConditions: string[] = [];
      const params: unknown[] = [];
      for (const [key, val] of Object.entries(where)) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          const subKeys = Object.keys(val);
          for (const subKey of subKeys) {
            const subCol = subKey.replace(/([A-Z])/g, "_$1").toLowerCase();
            simpleConditions.push(`${subCol} = ?`);
            params.push((val as Record<string, unknown>)[subKey]);
          }
        } else {
          const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          simpleConditions.push(`${col} = ?`);
          params.push(val);
        }
      }
      let existing: Record<string, unknown> | null = null;
      if (simpleConditions.length > 0) {
        const findSql = `SELECT * FROM ${tableName} WHERE ${simpleConditions.join(" AND ")} LIMIT 1`;
        existing = db.prepare(findSql).get(...params) as Record<string, unknown> | undefined;
      }
      if (!existing) {
        const allRows = db.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];
        for (const row of allRows) {
          if (matchWhere(row, where)) {
            existing = row;
            break;
          }
        }
      }
      if (existing) {
        const snakeUpdate = toSnake(update as Record<string, unknown>);
        const updateFields = Object.keys(snakeUpdate);
        if (updateFields.length > 0) {
          const setClause = updateFields.map((f) => `${f} = ?`).join(", ");
          const updateValues = [...Object.values(snakeUpdate), existing[idField]];
          db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE ${idField} = ?`).run(...updateValues);
        }
        return toCamel({ ...existing, ...snakeUpdate });
      } else {
        const snakeCreate = toSnake(create as Record<string, unknown>);
        const id = randomUUID();
        snakeCreate[idField] = id;
        const fields = Object.keys(snakeCreate);
        const values = Object.values(snakeCreate);
        const sql = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`;
        db.prepare(sql).run(...values);
        return { ...create, [idField]: id };
      }
    },
    async update(args?: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const { where, data } = args || {};
      const snakeData = toSnake(data as Record<string, unknown>);
      const updateFields = Object.keys(snakeData);
      const setClause = updateFields.map((f) => `${f} = ?`).join(", ");
      const updateValues = [...Object.values(snakeData)];
      const whereConditions: string[] = [];
      const whereParams: unknown[] = [];
      for (const [key, val] of Object.entries(where)) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        whereConditions.push(`${col} = ?`);
        whereParams.push(val);
      }
      const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereConditions.join(" AND ")}`;
      db.prepare(sql).run(...updateValues, ...whereParams);
      const row = db
        .prepare(`SELECT * FROM ${tableName} WHERE ${whereConditions.join(" AND ")} LIMIT 1`)
        .get(...whereParams) as Record<string, unknown> | undefined;
      return toCamel(row);
    },
    async delete(args?: { where: Record<string, unknown> }) {
      const { where } = args || {};
      const whereConditions: string[] = [];
      const whereParams: unknown[] = [];
      for (const [key, val] of Object.entries(where)) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        whereConditions.push(`${col} = ?`);
        whereParams.push(val);
      }
      const sql = `DELETE FROM ${tableName} WHERE ${whereConditions.join(" AND ")}`;
      db.prepare(sql).run(...whereParams);
      return {};
    },
    async count(args?: { where?: Record<string, unknown> }) {
      const { where } = args || {};
      const conditions: string[] = [];
      const params: unknown[] = [];
      for (const [key, val] of Object.entries(where || {})) {
        if (key === "OR" || key === "AND" || key === "NOT") continue;
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        conditions.push(`${col} = ?`);
        params.push(val);
      }
      const sql = `SELECT COUNT(*) as c FROM ${tableName} ${
        conditions.length ? "WHERE " + conditions.join(" AND ") : ""
      }`;
      return db.prepare(sql).get(...params) as { c: number };
    },
  };
}

const BOOLEAN_FIELDS_SET = new Set(["isGuest", "isReady", "isWinner", "hasDropped", "isHost"]);
const prisma = {
  user: createTableClient("users"),
  room: createTableClient("rooms"),
  roomPlayer: createTableClient("room_players"),
  game: createTableClient("games"),
  gameResult: createTableClient("game_results"),
  friend: createTableClient("friends"),
  gameAction: createTableClient("game_actions"),
  $disconnect: async () => {
    db.close();
  },
  $connect: async () => {
    // No-op for SQLite
  },
};

export { prisma };
