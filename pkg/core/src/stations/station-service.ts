import { type Db, getUniqueViolationConstraint, stations } from '@pkg/db';
import type {
  AuthId,
  Station,
  StationCreateInput,
  StationListInput,
  StationSetActiveInput,
  StationUpdateInput,
} from '@pkg/schema';
import { and, asc, eq, type SQL } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, stationAuditDescriptor } from '../audit/audit-service.js';
import { mapStation } from '../jobs/job-mappers.js';
import { DuplicateStationNameError, StationNotFoundError } from './station-errors.js';

const stationDepartmentNameUniqueConstraint = 'station_department_name_unique';

export async function listStations({ db, input }: { db: Db; input: StationListInput }): Promise<Station[]> {
  const where = buildStationListWhere(input);
  const rows = await db.query.stations.findMany({
    where,
    orderBy: [asc(stations.department), asc(stations.displayOrder), asc(stations.name)],
  });

  return rows.map(mapStation);
}

export async function createStation({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: StationCreateInput;
}): Promise<Station> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(stations).values(input).returning();

      if (!row) {
        throw new Error('Station insert did not return a row');
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'created',
          actorUserId,
          after: row,
          before: null,
          changes: null,
          entityId: row.id,
          entityType: stationAuditDescriptor.entityType,
        },
      });

      return mapStation(row);
    });
  } catch (error) {
    throw mapStationUniqueViolation(error, input);
  }
}

export async function updateStation({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: StationUpdateInput;
}): Promise<Station> {
  let duplicateInput: { department: string; name: string } | undefined;

  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(stations).where(eq(stations.id, input.id)).for('update');

      if (!before) {
        throw new StationNotFoundError(input.id);
      }

      duplicateInput = { department: before.department, name: input.name };

      const after = {
        ...before,
        displayOrder: input.displayOrder,
        name: input.name,
        updatedAt: new Date(),
      };
      const changes = createAuditChanges(before, after, stationAuditDescriptor.fields);

      if (!changes) {
        return mapStation(before);
      }

      const [row] = await tx
        .update(stations)
        .set({
          displayOrder: input.displayOrder,
          name: input.name,
          updatedAt: after.updatedAt,
        })
        .where(eq(stations.id, input.id))
        .returning();

      if (!row) {
        throw new StationNotFoundError(input.id);
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: row,
          before,
          changes,
          entityId: row.id,
          entityType: stationAuditDescriptor.entityType,
        },
      });

      return mapStation(row);
    });
  } catch (error) {
    throw mapStationUniqueViolation(error, duplicateInput ?? { department: '', name: input.name });
  }
}

export async function setStationActive({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: StationSetActiveInput;
}): Promise<Station> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(stations).where(eq(stations.id, input.id)).for('update');

    if (!before) {
      throw new StationNotFoundError(input.id);
    }

    if (before.isActive === input.isActive) {
      return mapStation(before);
    }

    const after = {
      ...before,
      isActive: input.isActive,
      updatedAt: new Date(),
    };
    const changes = createAuditChanges(before, after, stationAuditDescriptor.fields);
    const [row] = await tx
      .update(stations)
      .set({
        isActive: input.isActive,
        updatedAt: after.updatedAt,
      })
      .where(eq(stations.id, input.id))
      .returning();

    if (!row) {
      throw new StationNotFoundError(input.id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: row,
        before,
        changes,
        entityId: row.id,
        entityType: stationAuditDescriptor.entityType,
      },
    });

    return mapStation(row);
  });
}

function buildStationListWhere(input: StationListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.department) {
    conditions.push(eq(stations.department, input.department));
  }

  if (input.isActive !== undefined) {
    conditions.push(eq(stations.isActive, input.isActive));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function mapStationUniqueViolation(error: unknown, input: { department: string; name: string }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (isStationDepartmentNameUniqueViolation(constraint)) {
    return new DuplicateStationNameError(input);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isStationDepartmentNameUniqueViolation(constraint: string | null): boolean {
  if (!constraint) {
    return false;
  }

  return constraint.includes(stationDepartmentNameUniqueConstraint) || constraint.includes('(department, name)');
}
