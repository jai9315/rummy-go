import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";
import { config } from "../config";

// ---------------------------------------------------------------------------
// Record Types (aligned with prisma/schema.prisma)
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string | null;
  profileImage: string | null;
  isGuest: boolean;
  createdAt: string;
  updatedAt: string;
  hostedRooms?: RoomRecord[];
  roomPlayers?: RoomPlayerRecord[];
  gameResults?: GameResultRecord[];
  sentFriends?: FriendRecord[];
  rcvdFriends?: FriendRecord[];
}

export interface FriendRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: string;
  sender?: Partial<UserRecord> | null;
  receiver?: Partial<UserRecord> | null;
}

export interface RoomRecord {
  id: string;
  roomCode: string;
  hostId: string;
  roomName: string;
  maxPlayers: number;
  status: string;
  passwordHash: string | null;
  roundCount: number;
  entryPoints: number;
  createdAt: string;
  updatedAt: string;
  host?: Partial<UserRecord> | null;
  players?: RoomPlayerRecord[];
  games?: GameRecord[];
}

export interface RoomPlayerRecord {
  id: string;
  roomId: string;
  userId: string;
  seatNumber: number;
  isReady: boolean;
  connectionStatus: string;
  joinedAt: string;
  room?: Partial<RoomRecord> | null;
  user?: Partial<UserRecord> | null;
}

export interface GameRecord {
  id: string;
  roomId: string;
  gameStatus: string;
  roundNumber: number;
  currentTurnPlayerId: string | null;
  wildJokerCard: string | null;
  createdAt: string;
  completedAt: string | null;
  room?: Partial<RoomRecord> | null;
  actions?: GameActionRecord[];
  results?: GameResultRecord[];
}

export interface GameActionRecord {
  id: string;
  gameId: string;
  playerId: string;
  actionType: string;
  actionData: string | null;
  createdAt: string;
  game?: Partial<GameRecord> | null;
}

export interface GameResultRecord {
  id: string;
  gameId: string;
  playerId: string;
  points: number;
  rank: number;
  isWinner: boolean;
  hasDropped: boolean;
  scoreDetail: string | null;
  createdAt: string;
  game?: Partial<GameRecord> | null;
  player?: Partial<UserRecord> | null;
}

// ---------------------------------------------------------------------------
// Query Argument Types
// ---------------------------------------------------------------------------

export type TableName =
  | "users"
  | "rooms"
  | "room_players"
  | "games"
  | "game_actions"
  | "game_results"
  | "friends";

type PrimitiveValue = string | number | boolean | null | undefined;

export interface WhereInput {
  OR?: WhereInput[];
  AND?: WhereInput[];
  NOT?: WhereInput | WhereInput[];
  [key: string]: PrimitiveValue | WhereInput | WhereInput[] | Record<string, PrimitiveValue>;
}

export type SelectMap<T> = {
  [K in keyof T]?: boolean;
};

export interface RelationIncludeSpec {
  select?: Record<string, boolean | undefined>;
  include?: IncludeMap;
}

export interface IncludeMap {
  [relationName: string]: boolean | RelationIncludeSpec | undefined;
}

export type OrderDirection = "asc" | "desc" | "ASC" | "DESC";
export type OrderByInput<T> = {
  [K in keyof T]?: OrderDirection;
};

export type SelectedRecord<T, S extends SelectMap<T> | undefined> =
  S extends SelectMap<T>
    ? {
        [K in keyof S as S[K] extends true ? K : never]: K extends keyof T ? T[K] : never;
      }
    : T;

export interface FindOneArgs<T, S extends SelectMap<T> | undefined = undefined> {
  where?: WhereInput;
  select?: S;
  include?: IncludeMap;
}

export interface FindManyArgs<T, S extends SelectMap<T> | undefined = undefined> {
  where?: WhereInput;
  select?: S;
  include?: IncludeMap;
  orderBy?: OrderByInput<T>;
  take?: number;
  skip?: number;
}

export interface CreateArgs<TData> {
  data: TData;
}

export interface UpdateArgs<TData> {
  where: WhereInput;
  data: TData;
}

export interface UpsertArgs<TCreate, TUpdate> {
  where: WhereInput;
  create: TCreate;
  update: TUpdate;
}

export interface DeleteArgs {
  where: WhereInput;
}

export interface CountArgs {
  where?: WhereInput;
}

// ---------------------------------------------------------------------------
// Schema Metadata & Relations
// ---------------------------------------------------------------------------

interface RelationDef {
  type: "many-to-one" | "one-to-many";
  targetTable: TableName;
  localKey: string; // camelCase field on source record
  targetKey: string; // camelCase field on target record
}

const TABLE_COLUMNS: Record<TableName, ReadonlySet<string>> = {
  users: new Set([
    "id",
    "username",
    "email",
    "password_hash",
    "profile_image",
    "is_guest",
    "created_at",
    "updated_at",
  ]),
  rooms: new Set([
    "id",
    "room_code",
    "host_id",
    "room_name",
    "max_players",
    "status",
    "password_hash",
    "round_count",
    "entry_points",
    "created_at",
    "updated_at",
  ]),
  room_players: new Set([
    "id",
    "room_id",
    "user_id",
    "seat_number",
    "is_ready",
    "connection_status",
    "joined_at",
  ]),
  games: new Set([
    "id",
    "room_id",
    "game_status",
    "round_number",
    "current_turn_player_id",
    "wild_joker_card",
    "created_at",
    "completed_at",
  ]),
  game_actions: new Set([
    "id",
    "game_id",
    "player_id",
    "action_type",
    "action_data",
    "created_at",
  ]),
  game_results: new Set([
    "id",
    "game_id",
    "player_id",
    "points",
    "rank",
    "is_winner",
    "has_dropped",
    "score_detail",
    "created_at",
  ]),
  friends: new Set([
    "id",
    "sender_id",
    "receiver_id",
    "status",
    "created_at",
  ]),
};

const RELATIONS: Record<TableName, Record<string, RelationDef>> = {
  users: {
    hostedRooms: { type: "one-to-many", targetTable: "rooms", localKey: "id", targetKey: "hostId" },
    roomPlayers: { type: "one-to-many", targetTable: "room_players", localKey: "id", targetKey: "userId" },
    gameResults: { type: "one-to-many", targetTable: "game_results", localKey: "id", targetKey: "playerId" },
    sentFriends: { type: "one-to-many", targetTable: "friends", localKey: "id", targetKey: "senderId" },
    rcvdFriends: { type: "one-to-many", targetTable: "friends", localKey: "id", targetKey: "receiverId" },
  },
  rooms: {
    host: { type: "many-to-one", targetTable: "users", localKey: "hostId", targetKey: "id" },
    players: { type: "one-to-many", targetTable: "room_players", localKey: "id", targetKey: "roomId" },
    games: { type: "one-to-many", targetTable: "games", localKey: "id", targetKey: "roomId" },
  },
  room_players: {
    room: { type: "many-to-one", targetTable: "rooms", localKey: "roomId", targetKey: "id" },
    user: { type: "many-to-one", targetTable: "users", localKey: "userId", targetKey: "id" },
  },
  games: {
    room: { type: "many-to-one", targetTable: "rooms", localKey: "roomId", targetKey: "id" },
    actions: { type: "one-to-many", targetTable: "game_actions", localKey: "id", targetKey: "gameId" },
    results: { type: "one-to-many", targetTable: "game_results", localKey: "id", targetKey: "gameId" },
  },
  game_actions: {
    game: { type: "many-to-one", targetTable: "games", localKey: "gameId", targetKey: "id" },
  },
  game_results: {
    game: { type: "many-to-one", targetTable: "games", localKey: "gameId", targetKey: "id" },
    player: { type: "many-to-one", targetTable: "users", localKey: "playerId", targetKey: "id" },
  },
  friends: {
    sender: { type: "many-to-one", targetTable: "users", localKey: "senderId", targetKey: "id" },
    receiver: { type: "many-to-one", targetTable: "users", localKey: "receiverId", targetKey: "id" },
  },
};

const BOOLEAN_FIELDS: ReadonlySet<string> = new Set([
  "isGuest",
  "isReady",
  "isWinner",
  "hasDropped",
  "isHost",
]);

// ---------------------------------------------------------------------------
// Lazy SQLite Connection Management
// ---------------------------------------------------------------------------

let dbInstance: DatabaseSync | null = null;
let initializedDbPath: string | null = null;

function resolveDbPath(): string {
  const url = config.databaseUrl;
  return url.startsWith("file:") ? url.slice(5) : url;
}

function getDb(): DatabaseSync {
  const dbPath = resolveDbPath();
  if (dbInstance && initializedDbPath === dbPath) {
    return dbInstance;
  }

  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  if (dbPath !== ":memory:") {
    const dir = path.dirname(path.resolve(dbPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA foreign_keys = ON;");

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
  FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS room_players (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  is_ready INTEGER DEFAULT 0,
  connection_status TEXT DEFAULT 'CONNECTED',
  joined_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
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
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS game_actions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
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
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (sender_id, receiver_id)
);
`);

  dbInstance = db;
  initializedDbPath = dbPath;
  return db;
}

// ---------------------------------------------------------------------------
// Conversion, Validation & SQL Query Helpers
// ---------------------------------------------------------------------------

type SqlRow = Record<string, SQLOutputValue>;
type CamelRecord = Record<string, unknown>;

function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function assertValidColumn(tableName: TableName, camelOrSnakeKey: string): string {
  const col = camelToSnake(camelOrSnakeKey);
  if (!TABLE_COLUMNS[tableName].has(col)) {
    throw new Error(`Invalid column "${camelOrSnakeKey}" for table "${tableName}"`);
  }
  return col;
}

function toSqlInputValue(value: unknown): SQLInputValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string" || typeof value === "bigint") {
    return value;
  }
  throw new Error(`Unsupported SQL input value type: ${typeof value}`);
}

function rowToCamel(row: SqlRow): CamelRecord {
  const result: CamelRecord = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key);
    if (BOOLEAN_FIELDS.has(camelKey) && typeof value === "number") {
      result[camelKey] = value === 1;
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

function dataToSnake(tableName: TableName, data: object): Record<string, SQLInputValue> {
  const result: Record<string, SQLInputValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const col = assertValidColumn(tableName, key);
    result[col] = toSqlInputValue(value);
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface CompiledWhere {
  sql: string;
  params: SQLInputValue[];
}

function compileWhere(tableName: TableName, where: WhereInput | undefined): CompiledWhere {
  if (!where) return { sql: "", params: [] };

  const clauses: string[] = [];
  const params: SQLInputValue[] = [];

  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;

    if (key === "OR" && Array.isArray(val)) {
      const subClauses: string[] = [];
      for (const sub of val) {
        const compiled = compileWhere(tableName, sub);
        if (compiled.sql) {
          subClauses.push(`(${compiled.sql})`);
          params.push(...compiled.params);
        }
      }
      if (subClauses.length > 0) {
        clauses.push(`(${subClauses.join(" OR ")})`);
      }
    } else if (key === "AND" && Array.isArray(val)) {
      const subClauses: string[] = [];
      for (const sub of val) {
        const compiled = compileWhere(tableName, sub);
        if (compiled.sql) {
          subClauses.push(`(${compiled.sql})`);
          params.push(...compiled.params);
        }
      }
      if (subClauses.length > 0) {
        clauses.push(`(${subClauses.join(" AND ")})`);
      }
    } else if (key === "NOT") {
      const items = Array.isArray(val) ? val : [val];
      const subClauses: string[] = [];
      for (const sub of items) {
        if (isPlainObject(sub)) {
          const compiled = compileWhere(tableName, sub as WhereInput);
          if (compiled.sql) {
            subClauses.push(`(${compiled.sql})`);
            params.push(...compiled.params);
          }
        }
      }
      if (subClauses.length > 0) {
        clauses.push(`NOT (${subClauses.join(" OR ")})`);
      }
    } else if (isPlainObject(val)) {
      // Compound unique key object (e.g. roomId_userId: { roomId, userId })
      const compiled = compileWhere(tableName, val as WhereInput);
      if (compiled.sql) {
        clauses.push(`(${compiled.sql})`);
        params.push(...compiled.params);
      }
    } else {
      const col = assertValidColumn(tableName, key);
      if (val === null) {
        clauses.push(`${col} IS NULL`);
      } else {
        clauses.push(`${col} = ?`);
        params.push(toSqlInputValue(val));
      }
    }
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

function applySelect(
  record: CamelRecord,
  select: Record<string, boolean | undefined> | undefined,
  includedKeys?: ReadonlySet<string>
): CamelRecord {
  if (!select) return record;
  const filtered: CamelRecord = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled === true && key in record) {
      filtered[key] = record[key];
    }
  }
  if (includedKeys) {
    for (const relKey of includedKeys) {
      if (relKey in record) {
        filtered[relKey] = record[relKey];
      }
    }
  }
  return filtered;
}

function isRelationIncludeSpec(
  value: boolean | RelationIncludeSpec
): value is RelationIncludeSpec {
  return typeof value === "object" && value !== null;
}

function hydrateRelations(
  tableName: TableName,
  record: CamelRecord,
  include: IncludeMap | undefined
): ReadonlySet<string> {
  const includedKeys = new Set<string>();
  if (!include) return includedKeys;

  const db = getDb();
  const tableRelations = RELATIONS[tableName];

  for (const [relName, relSpec] of Object.entries(include)) {
    if (!relSpec) continue;
    const relDef = tableRelations[relName];
    if (!relDef) {
      throw new Error(`Unknown relation "${relName}" on table "${tableName}"`);
    }

    const nestedSelect = isRelationIncludeSpec(relSpec) ? relSpec.select : undefined;
    const nestedInclude = isRelationIncludeSpec(relSpec) ? relSpec.include : undefined;
    const targetCol = assertValidColumn(relDef.targetTable, relDef.targetKey);
    const localVal = record[relDef.localKey];

    includedKeys.add(relName);

    if (relDef.type === "many-to-one") {
      if (localVal === null || localVal === undefined) {
        record[relName] = null;
        continue;
      }
      const row = db
        .prepare(`SELECT * FROM ${relDef.targetTable} WHERE ${targetCol} = ? LIMIT 1`)
        .get(toSqlInputValue(localVal)) as SqlRow | undefined;
      if (!row) {
        record[relName] = null;
      } else {
        const camel = rowToCamel(row);
        const childIncluded = hydrateRelations(relDef.targetTable, camel, nestedInclude);
        record[relName] = applySelect(camel, nestedSelect, childIncluded);
      }
    } else {
      if (localVal === null || localVal === undefined) {
        record[relName] = [];
        continue;
      }
      const rows = db
        .prepare(`SELECT * FROM ${relDef.targetTable} WHERE ${targetCol} = ?`)
        .all(toSqlInputValue(localVal)) as SqlRow[];
      record[relName] = rows.map((row) => {
        const camel = rowToCamel(row);
        const childIncluded = hydrateRelations(relDef.targetTable, camel, nestedInclude);
        return applySelect(camel, nestedSelect, childIncluded);
      });
    }
  }

  return includedKeys;
}

function hydrateRow(
  tableName: TableName,
  row: SqlRow,
  select?: Record<string, boolean | undefined>,
  include?: IncludeMap
): CamelRecord {
  const camel = rowToCamel(row);
  const includedKeys = hydrateRelations(tableName, camel, include);
  return applySelect(camel, select, includedKeys);
}

// ---------------------------------------------------------------------------
// Generic Strictly-Typed Table Client
// ---------------------------------------------------------------------------

export interface TableClient<TRecord, TCreateInput extends object, TUpdateInput extends object> {
  findUnique<S extends SelectMap<TRecord> | undefined = undefined>(
    args?: FindOneArgs<TRecord, S>
  ): Promise<SelectedRecord<TRecord, S> | null>;
  findFirst<S extends SelectMap<TRecord> | undefined = undefined>(
    args?: FindOneArgs<TRecord, S>
  ): Promise<SelectedRecord<TRecord, S> | null>;
  findMany<S extends SelectMap<TRecord> | undefined = undefined>(
    args?: FindManyArgs<TRecord, S>
  ): Promise<SelectedRecord<TRecord, S>[]>;
  create(args: CreateArgs<TCreateInput>): Promise<TRecord>;
  upsert(args: UpsertArgs<TCreateInput, TUpdateInput>): Promise<TRecord>;
  update(args: UpdateArgs<TUpdateInput>): Promise<TRecord | null>;
  delete(args: DeleteArgs): Promise<{ count: number }>;
  count(args?: CountArgs): Promise<number>;
}

function createTableClient<
  TRecord extends { id: string },
  TCreateInput extends object,
  TUpdateInput extends object,
>(tableName: TableName): TableClient<TRecord, TCreateInput, TUpdateInput> {
  const idField = "id";

  async function findOne<S extends SelectMap<TRecord> | undefined = undefined>(
    args?: FindOneArgs<TRecord, S>
  ): Promise<SelectedRecord<TRecord, S> | null> {
    const db = getDb();
    const compiled = compileWhere(tableName, args?.where);
    const sql = `SELECT * FROM ${tableName}${compiled.sql ? ` WHERE ${compiled.sql}` : ""} LIMIT 1`;
    const row = db.prepare(sql).get(...compiled.params) as SqlRow | undefined;
    if (!row) return null;
    return hydrateRow(
      tableName,
      row,
      args?.select as Record<string, boolean | undefined> | undefined,
      args?.include
    ) as unknown as SelectedRecord<TRecord, S>;
  }

  return {
    findUnique: findOne,
    findFirst: findOne,

    async findMany<S extends SelectMap<TRecord> | undefined = undefined>(
      args?: FindManyArgs<TRecord, S>
    ): Promise<SelectedRecord<TRecord, S>[]> {
      const db = getDb();
      const compiled = compileWhere(tableName, args?.where);
      const params: SQLInputValue[] = [...compiled.params];
      let sql = `SELECT * FROM ${tableName}`;
      if (compiled.sql) {
        sql += ` WHERE ${compiled.sql}`;
      }

      if (args?.orderBy) {
        const orderParts: string[] = [];
        for (const [key, dir] of Object.entries(args.orderBy)) {
          if (!dir) continue;
          const col = assertValidColumn(tableName, key);
          const normalizedDir = String(dir).toUpperCase();
          if (normalizedDir !== "ASC" && normalizedDir !== "DESC") {
            throw new Error(`Invalid order direction: ${String(dir)}`);
          }
          orderParts.push(`${col} ${normalizedDir}`);
        }
        if (orderParts.length > 0) {
          sql += ` ORDER BY ${orderParts.join(", ")}`;
        }
      }

      if (args?.take !== undefined) {
        const limit = Math.max(0, Math.floor(args.take));
        sql += " LIMIT ?";
        params.push(limit);
      } else if (args?.skip !== undefined) {
        sql += " LIMIT -1";
      }

      if (args?.skip !== undefined) {
        const offset = Math.max(0, Math.floor(args.skip));
        sql += " OFFSET ?";
        params.push(offset);
      }

      const rows = db.prepare(sql).all(...params) as SqlRow[];
      return rows.map(
        (row) =>
          hydrateRow(
            tableName,
            row,
            args?.select as Record<string, boolean | undefined> | undefined,
            args?.include
          ) as unknown as SelectedRecord<TRecord, S>
      );
    },

    async create(args: CreateArgs<TCreateInput>): Promise<TRecord> {
      const db = getDb();
      const snakeData = dataToSnake(tableName, args.data);
      // Preserve caller-supplied id if non-empty; otherwise generate a UUID.
      const providedId = snakeData[idField];
      const id =
        typeof providedId === "string" && providedId.trim().length > 0
          ? providedId
          : randomUUID();
      snakeData[idField] = id;

      const fields = Object.keys(snakeData);
      const values = Object.values(snakeData);
      const sql = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${fields
        .map(() => "?")
        .join(", ")})`;
      db.prepare(sql).run(...values);

      const inserted = db
        .prepare(`SELECT * FROM ${tableName} WHERE ${idField} = ? LIMIT 1`)
        .get(id) as SqlRow | undefined;
      if (!inserted) {
        throw new Error(`Failed to read back inserted row from ${tableName}`);
      }
      return rowToCamel(inserted) as unknown as TRecord;
    },

    async upsert(args: UpsertArgs<TCreateInput, TUpdateInput>): Promise<TRecord> {
      const db = getDb();
      const compiled = compileWhere(tableName, args.where);
      const existing = compiled.sql
        ? (db
            .prepare(`SELECT * FROM ${tableName} WHERE ${compiled.sql} LIMIT 1`)
            .get(...compiled.params) as SqlRow | undefined)
        : undefined;

      if (existing) {
        const snakeUpdate = dataToSnake(tableName, args.update);
        const updateFields = Object.keys(snakeUpdate);
        const existingId = existing[idField];
        if (updateFields.length > 0 && existingId !== undefined) {
          const setClause = updateFields.map((f) => `${f} = ?`).join(", ");
          db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE ${idField} = ?`).run(
            ...Object.values(snakeUpdate),
            toSqlInputValue(existingId)
          );
        }
        const refreshed = db
          .prepare(`SELECT * FROM ${tableName} WHERE ${idField} = ? LIMIT 1`)
          .get(toSqlInputValue(existingId)) as SqlRow | undefined;
        return rowToCamel(refreshed ?? existing) as unknown as TRecord;
      }

      const snakeCreate = dataToSnake(tableName, args.create);
      const providedId = snakeCreate[idField];
      const id =
        typeof providedId === "string" && providedId.trim().length > 0
          ? providedId
          : randomUUID();
      snakeCreate[idField] = id;

      const fields = Object.keys(snakeCreate);
      const values = Object.values(snakeCreate);
      const sql = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${fields
        .map(() => "?")
        .join(", ")})`;
      db.prepare(sql).run(...values);

      const inserted = db
        .prepare(`SELECT * FROM ${tableName} WHERE ${idField} = ? LIMIT 1`)
        .get(id) as SqlRow | undefined;
      if (!inserted) {
        throw new Error(`Failed to read back upserted row from ${tableName}`);
      }
      return rowToCamel(inserted) as unknown as TRecord;
    },

    async update(args: UpdateArgs<TUpdateInput>): Promise<TRecord | null> {
      const db = getDb();
      const compiled = compileWhere(tableName, args.where);
      if (!compiled.sql) {
        throw new Error(`update() on "${tableName}" requires a non-empty where clause`);
      }

      const snakeData = dataToSnake(tableName, args.data);
      const updateFields = Object.keys(snakeData);
      if (updateFields.length > 0) {
        const setClause = updateFields.map((f) => `${f} = ?`).join(", ");
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${compiled.sql}`;
        db.prepare(sql).run(...Object.values(snakeData), ...compiled.params);
      }

      const row = db
        .prepare(`SELECT * FROM ${tableName} WHERE ${compiled.sql} LIMIT 1`)
        .get(...compiled.params) as SqlRow | undefined;
      if (!row) return null;
      return rowToCamel(row) as unknown as TRecord;
    },

    async delete(args: DeleteArgs): Promise<{ count: number }> {
      const db = getDb();
      const compiled = compileWhere(tableName, args.where);
      if (!compiled.sql) {
        throw new Error(`delete() on "${tableName}" requires a non-empty where clause`);
      }
      const res = db
        .prepare(`DELETE FROM ${tableName} WHERE ${compiled.sql}`)
        .run(...compiled.params);
      return { count: Number(res.changes) };
    },

    async count(args?: CountArgs): Promise<number> {
      const db = getDb();
      const compiled = compileWhere(tableName, args?.where);
      const sql = `SELECT COUNT(*) as c FROM ${tableName}${
        compiled.sql ? ` WHERE ${compiled.sql}` : ""
      }`;
      const row = db.prepare(sql).get(...compiled.params) as { c?: number | bigint } | undefined;
      return row && row.c !== undefined ? Number(row.c) : 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Create / Update Input Types per Model
// ---------------------------------------------------------------------------

export interface UserCreateInput {
  id?: string;
  username: string;
  email?: string | null;
  passwordHash?: string | null;
  profileImage?: string | null;
  isGuest?: boolean;
}

export type UserUpdateInput = Partial<UserCreateInput>;

export interface RoomCreateInput {
  id?: string;
  roomCode: string;
  hostId: string;
  roomName: string;
  maxPlayers?: number;
  status?: string;
  passwordHash?: string | null;
  roundCount?: number;
  entryPoints?: number;
}

export type RoomUpdateInput = Partial<RoomCreateInput>;

export interface RoomPlayerCreateInput {
  id?: string;
  roomId: string;
  userId: string;
  seatNumber: number;
  isReady?: boolean;
  connectionStatus?: string;
}

export type RoomPlayerUpdateInput = Partial<RoomPlayerCreateInput>;

export interface GameCreateInput {
  id?: string;
  roomId: string;
  gameStatus?: string;
  roundNumber?: number;
  currentTurnPlayerId?: string | null;
  wildJokerCard?: string | null;
  completedAt?: string | null;
}

export type GameUpdateInput = Partial<GameCreateInput>;

export interface GameActionCreateInput {
  id?: string;
  gameId: string;
  playerId: string;
  actionType: string;
  actionData?: string | null;
}

export type GameActionUpdateInput = Partial<GameActionCreateInput>;

export interface GameResultCreateInput {
  id?: string;
  gameId: string;
  playerId: string;
  points?: number;
  rank?: number;
  isWinner?: boolean;
  hasDropped?: boolean;
  scoreDetail?: string | null;
}

export type GameResultUpdateInput = Partial<GameResultCreateInput>;

export interface FriendCreateInput {
  id?: string;
  senderId: string;
  receiverId: string;
  status?: string;
}

export type FriendUpdateInput = Partial<FriendCreateInput>;

// ---------------------------------------------------------------------------
// Exported Prisma-Compatible Strictly-Typed Client
// ---------------------------------------------------------------------------

export const prisma = {
  user: createTableClient<UserRecord, UserCreateInput, UserUpdateInput>("users"),
  room: createTableClient<RoomRecord, RoomCreateInput, RoomUpdateInput>("rooms"),
  roomPlayer: createTableClient<RoomPlayerRecord, RoomPlayerCreateInput, RoomPlayerUpdateInput>(
    "room_players"
  ),
  game: createTableClient<GameRecord, GameCreateInput, GameUpdateInput>("games"),
  gameResult: createTableClient<GameResultRecord, GameResultCreateInput, GameResultUpdateInput>(
    "game_results"
  ),
  friend: createTableClient<FriendRecord, FriendCreateInput, FriendUpdateInput>("friends"),
  gameAction: createTableClient<GameActionRecord, GameActionCreateInput, GameActionUpdateInput>(
    "game_actions"
  ),
  $disconnect: async (): Promise<void> => {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
      initializedDbPath = null;
    }
  },
  $connect: async (): Promise<void> => {
    getDb();
  },
};
