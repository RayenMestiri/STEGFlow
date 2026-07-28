import pg from 'pg';
import { connectDatabase, disconnectDatabase } from '../db/connect.js';
import {
  AuditLog,
  AuthEvent,
  CitizenConfirmation,
  FieldTeam,
  Incident,
  Mission,
  NotificationCampaign,
  Outage,
  SystemSetting,
  User,
} from '../models/index.js';

const { Pool } = pg;
const replace = process.argv.includes('--replace');
const postgresUrl =
  process.env.LEGACY_POSTGRES_URL ??
  'postgresql://steg:steg_dev_password@localhost:5432/stegflow';

const pool = new Pool({ connectionString: postgresUrl });

type CollectionTarget = {
  name: string;
  model: {
    deleteMany(filter: object): Promise<unknown>;
    collection: {
      bulkWrite(operations: any[], options?: object): Promise<unknown>;
    };
  };
  query: string;
  transform?: (row: Record<string, any>) => Record<string, any>;
};

function baseRow(row: Record<string, any>): Record<string, any> {
  const { id, ...rest } = row;
  return { _id: id, ...rest };
}

function geometryRow(
  row: Record<string, any>,
  mappings: Array<[string, string]>,
) {
  const result = baseRow(row);
  for (const [field, alias] of mappings) {
    result[field] = result[alias] ?? null;
    delete result[alias];
  }
  return result;
}

const targets: CollectionTarget[] = [
  {
    name: 'users',
    model: User,
    query: 'SELECT * FROM users',
    transform: (row) => {
      const result = baseRow(row);
      result.refreshTokenHash = null;
      return result;
    },
  },
  {
    name: 'auth_events',
    model: AuthEvent,
    query: 'SELECT * FROM auth_events',
  },
  {
    name: 'outages',
    model: Outage,
    query:
      'SELECT o.*, CASE WHEN o.perimeter IS NULL THEN NULL ELSE ST_AsGeoJSON(o.perimeter)::json END AS "perimeterGeo" FROM outages o',
    transform: (row) => geometryRow(row, [['perimeter', 'perimeterGeo']]),
  },
  {
    name: 'incidents',
    model: Incident,
    query:
      'SELECT i.*, ST_AsGeoJSON(i.location)::json AS "locationGeo" FROM incidents i',
    transform: (row) => geometryRow(row, [['location', 'locationGeo']]),
  },
  {
    name: 'missions',
    model: Mission,
    query:
      'SELECT m.*, CASE WHEN m."lastPosition" IS NULL THEN NULL ELSE ST_AsGeoJSON(m."lastPosition")::json END AS "lastPositionGeo" FROM missions m',
    transform: (row) =>
      geometryRow(row, [['lastPosition', 'lastPositionGeo']]),
  },
  {
    name: 'field_teams',
    model: FieldTeam,
    query:
      'SELECT t.*, CASE WHEN t.location IS NULL THEN NULL ELSE ST_AsGeoJSON(t.location)::json END AS "locationGeo" FROM field_teams t',
    transform: (row) => geometryRow(row, [['location', 'locationGeo']]),
  },
  {
    name: 'notification_campaigns',
    model: NotificationCampaign,
    query: 'SELECT * FROM notification_campaigns',
  },
  {
    name: 'operational_audit_logs',
    model: AuditLog,
    query: 'SELECT * FROM operational_audit_logs',
  },
  {
    name: 'system_settings',
    model: SystemSetting,
    query: 'SELECT * FROM system_settings',
  },
  {
    name: 'citizen_confirmations',
    model: CitizenConfirmation,
    query: 'SELECT * FROM citizen_confirmations',
  },
];

async function migrate() {
  await connectDatabase();
  const summary: Record<string, number> = {};
  for (const target of targets) {
    const result = await pool.query(target.query);
    const rows = result.rows.map((row) =>
      target.transform ? target.transform(row) : baseRow(row),
    );
    if (replace) await target.model.deleteMany({});
    if (rows.length) {
      await target.model.collection.bulkWrite(
        rows.map((row) => ({
          replaceOne: {
            filter: { _id: row._id },
            replacement: row,
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    summary[target.name] = rows.length;
  }
  console.log(JSON.stringify({ migrated: summary, replace }));
}

migrate()
  .finally(async () => {
    await pool.end();
    await disconnectDatabase();
  })
  .catch((error) => {
    console.error('Migration PostgreSQL → MongoDB échouée', error);
    process.exitCode = 1;
  });
