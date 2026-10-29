import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
  translatingConstraintViolations,
} from '@pkg/core';
import { latestReadingColumns, stampSerialNumber } from '@pkg/core/contracting';
import { and, asc, type Db, eq, isNull, ne, or, sql } from '@pkg/db';
import { contractingCategories, contractingJohnDeereLinks, contractingMachines } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { JohnDeereLinkView, JohnDeereUnlinkedMachine } from '@pkg/schema/contracting';
import type { DeereEngineHours, JohnDeereClient } from './client.js';
import type { JohnDeereConnectionService } from './connection-service.js';
import {
  equipmentLinked,
  equipmentNotFound,
  isJohnDeereError,
  linkNotFound,
  machineLinked,
  machineNotFound,
  machineRetired,
  serialTaken,
} from './john-deere-errors.js';

type LinkRow = typeof contractingJohnDeereLinks.$inferSelect;
/** A Link as audited: labelled by its Machine's code, which lives on the Machine. */
type AuditedLink = LinkRow & { machineCode: string };

export type JohnDeereLinkServiceConfig = {
  db: Db;
  client: JohnDeereClient;
  connection: JohnDeereConnectionService;
  now: () => Date;
};

// Engine-hours calls in flight at once, so a fleet's worth stays clear of Deere's rate limit.
const HOURS_CONCURRENCY = 4;

// The poll's columns move every hour and the lost flag follows Deere; neither is an audited fact.
const descriptor = defineAuditDescriptor<AuditedLink>({
  entityType: 'contracting_john_deere_link',
  noun: 'John Deere Link',
  primaryLabelField: 'machineCode',
  entityId: (link) => link.id,
  label: (link) => link.machineCode,
  toRecord: (link) => ({
    machineId: link.machineId,
    equipmentId: link.equipmentId,
    principalId: link.principalId,
    organizationId: link.organizationId,
    serialNumber: link.serialNumber,
    deereName: link.deereName,
    linkedByUserId: link.linkedByUserId,
    linkedAt: link.linkedAt.toISOString(),
    unlinkedByUserId: link.unlinkedByUserId,
    unlinkedAt: link.unlinkedAt?.toISOString() ?? null,
  }),
});

const activeLink = isNull(contractingJohnDeereLinks.unlinkedAt);

// Links to two Machines take two Machine locks, so a race for one Deere machine or one PIN meets the index.
const uniqueRefusals: Record<string, () => Error> = {
  john_deere_link_active_equipment_unique: equipmentLinked,
  machine_serial_number_ci_unique: () => serialTaken(),
};
const linkConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    { unique: (constraint) => uniqueRefusals[constraint ?? '']?.(), foreignKey: () => undefined },
    action,
  );

/** A Link the poll reads, with whether Deere stopped listing its machine. */
export type PollableLink = { id: string; machineId: string; equipmentId: string; principalId: number; lost: boolean };

/** What one poll saw of a Link; a field left out is left as it was. */
export type LinkObservation = Partial<
  Pick<LinkRow, 'lostAt' | 'lastPolledAt' | 'lastReportTime' | 'lastValue' | 'lastError' | 'lastErrorAt'>
>;

/** John Deere Links: which Deere machine feeds which Machine, made and ended on the John Deere tab. */
export class JohnDeereLinkService {
  constructor(private readonly config: JohnDeereLinkServiceConfig) {}

  /** The organization's machines no Machine is linked to, by name, each with what it last reported. */
  async listUnlinkedMachines(): Promise<JohnDeereUnlinkedMachine[]> {
    const { client, connection, db } = this.config;
    return connection.withAccessToken(async (accessToken) => {
      const [listed, linked] = await Promise.all([
        client.equipment(accessToken),
        db
          .select({ equipmentId: contractingJohnDeereLinks.equipmentId })
          .from(contractingJohnDeereLinks)
          .where(activeLink),
      ]);
      const linkedIds = new Set(linked.map((link) => link.equipmentId));
      const unlinked = listed
        .filter((machine) => !linkedIds.has(machine.id))
        .sort((left, right) => left.name.localeCompare(right.name));
      const reports = await mapConcurrently(unlinked, HOURS_CONCURRENCY, (machine) =>
        readEngineHours(client, accessToken, machine.principalId),
      );
      return unlinked.map((machine, index) =>
        JohnDeereUnlinkedMachine.parse({
          equipmentId: machine.id,
          principalId: machine.principalId,
          name: machine.name,
          serialNumber: machine.serialNumber,
          make: machine.make,
          model: machine.model,
          modelYear: machine.modelYear,
          lastHours: reports[index]?.hours ?? null,
          lastReportTime: reports[index]?.reportTime.toISOString() ?? null,
        }),
      );
    });
  }

  /** Every active Link beside its Machine, by Machine code. */
  async listLinks(): Promise<JohnDeereLinkView[]> {
    const { latestReadingHours, latestReadingAt } = latestReadingColumns(contractingMachines);
    const rows = await this.config.db
      .select({
        link: contractingJohnDeereLinks,
        machine: {
          id: contractingMachines.id,
          code: contractingMachines.code,
          categoryIcon: contractingCategories.icon,
          categoryColour: contractingCategories.colour,
          retiredAt: contractingMachines.retiredAt,
          latestReadingHours,
          latestReadingAt,
        },
      })
      .from(contractingJohnDeereLinks)
      .innerJoin(contractingMachines, eq(contractingMachines.id, contractingJohnDeereLinks.machineId))
      .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
      .where(activeLink)
      .orderBy(asc(contractingMachines.code));
    return rows.map(({ link, machine }) =>
      JohnDeereLinkView.parse({
        id: link.id,
        machine: { ...machine, retiredAt: machine.retiredAt?.toISOString() ?? null },
        equipmentId: link.equipmentId,
        principalId: link.principalId,
        deereName: link.deereName,
        serialNumber: link.serialNumber,
        linkedAt: link.linkedAt.toISOString(),
        lost: link.lostAt !== null,
        lastPolledAt: link.lastPolledAt?.toISOString() ?? null,
        lastReportTime: link.lastReportTime?.toISOString() ?? null,
        lastValue: link.lastValue,
        lastError: link.lastError,
      }),
    );
  }

  /**
   * Links a Machine to a machine the organization lists, under the Machine's row lock, and writes the Deere
   * PIN as the Machine's serial number.
   */
  async linkMachine({
    actorUserId,
    machineId,
    equipmentId,
  }: {
    actorUserId: AuthId;
    machineId: string;
    equipmentId: string;
  }): Promise<{ linkId: string }> {
    const { client, connection } = this.config;
    const listed = await connection.withAccessToken((accessToken) => client.equipmentByIds(accessToken, [equipmentId]));
    const deere = listed.find((candidate) => candidate.id === equipmentId && !candidate.archived);
    if (!deere) throw equipmentNotFound();
    return linkConstraints(() =>
      this.config.db.transaction(async (tx) => {
        const [machine] = await tx
          .select({ code: contractingMachines.code, retiredAt: contractingMachines.retiredAt })
          .from(contractingMachines)
          .where(eq(contractingMachines.id, machineId))
          .for('update');
        if (!machine) throw machineNotFound();
        if (machine.retiredAt) throw machineRetired(machine.code);
        const [linked] = await tx
          .select({ machineId: contractingJohnDeereLinks.machineId })
          .from(contractingJohnDeereLinks)
          .where(
            and(
              activeLink,
              or(
                eq(contractingJohnDeereLinks.machineId, machineId),
                eq(contractingJohnDeereLinks.equipmentId, equipmentId),
              ),
            ),
          );
        if (linked) throw linked.machineId === machineId ? machineLinked(machine.code) : equipmentLinked();
        if (deere.serialNumber) {
          const [holder] = await tx
            .select({ code: contractingMachines.code })
            .from(contractingMachines)
            .where(
              and(
                ne(contractingMachines.id, machineId),
                sql`lower(${contractingMachines.serialNumber}) = lower(${deere.serialNumber})`,
              ),
            );
          if (holder) throw serialTaken(`${holder.code} already holds serial number ${deere.serialNumber}.`);
        }

        const [link] = await tx
          .insert(contractingJohnDeereLinks)
          .values({
            machineId,
            equipmentId,
            principalId: deere.principalId,
            organizationId: deere.organizationId,
            serialNumber: deere.serialNumber,
            deereName: deere.name,
            deereMake: deere.make,
            deereModel: deere.model,
            deereModelYear: deere.modelYear,
            linkedByUserId: actorUserId,
            linkedAt: this.config.now(),
          })
          .returning();
        if (!link) throw new Error('John Deere Link insert returned no row');
        await recordAuditCreate({ db: tx, descriptor, actorUserId, input: { ...link, machineCode: machine.code } });
        if (deere.serialNumber)
          await stampSerialNumber({ db: tx, actorUserId, machineId, serialNumber: deere.serialNumber });
        return { linkId: link.id };
      }),
    );
  }

  /** Active Links whose Machine is still in service: the ones the poll reads. */
  async listPollable(): Promise<PollableLink[]> {
    return this.config.db
      .select({
        id: contractingJohnDeereLinks.id,
        machineId: contractingJohnDeereLinks.machineId,
        equipmentId: contractingJohnDeereLinks.equipmentId,
        principalId: contractingJohnDeereLinks.principalId,
        lost: sql<boolean>`${contractingJohnDeereLinks.lostAt} is not null`,
      })
      .from(contractingJohnDeereLinks)
      .innerJoin(contractingMachines, eq(contractingMachines.id, contractingJohnDeereLinks.machineId))
      .where(and(activeLink, isNull(contractingMachines.retiredAt)))
      .orderBy(asc(contractingMachines.code));
  }

  /** Writes what the poll learned about a Link. Unaudited: the poll moves these every hour. */
  async recordPoll(linkId: string, observed: LinkObservation): Promise<void> {
    await this.config.db
      .update(contractingJohnDeereLinks)
      .set({ ...observed, updatedAt: this.config.now() })
      .where(and(eq(contractingJohnDeereLinks.id, linkId), activeLink));
  }

  /** Ends a Link; the row stays, so the readings it fed keep their provenance. */
  async unlinkMachine({ actorUserId, linkId }: { actorUserId: AuthId; linkId: string }): Promise<void> {
    await this.config.db.transaction(async (tx) => {
      const [before] = await tx
        .select({ link: contractingJohnDeereLinks, machineCode: contractingMachines.code })
        .from(contractingJohnDeereLinks)
        .innerJoin(contractingMachines, eq(contractingMachines.id, contractingJohnDeereLinks.machineId))
        .where(and(eq(contractingJohnDeereLinks.id, linkId), activeLink))
        .for('update');
      if (!before) throw linkNotFound();
      const now = this.config.now();
      const [row] = await tx
        .update(contractingJohnDeereLinks)
        .set({ unlinkedByUserId: actorUserId, unlinkedAt: now, updatedAt: now })
        .where(eq(contractingJohnDeereLinks.id, linkId))
        .returning();
      if (!row) throw new Error('The John Deere Link vanished under its row lock.');
      const audited = (link: LinkRow): AuditedLink => ({ ...link, machineCode: before.machineCode });
      const changes = diffAuditUpdate(descriptor, audited(before.link), audited(row));
      if (changes) await recordAuditUpdate({ db: tx, descriptor, actorUserId, after: audited(row), changes });
    });
  }
}

/** A machine John Deere holds no hours for, or will not show, reads as having reported none. */
async function readEngineHours(
  client: JohnDeereClient,
  accessToken: string,
  principalId: number,
): Promise<DeereEngineHours | null> {
  try {
    return await client.engineHours(accessToken, principalId);
  } catch (error) {
    if (isJohnDeereError(error) && (error.code === 'john_deere.not_found' || error.code === 'john_deere.forbidden'))
      return null;
    throw error;
  }
}

async function mapConcurrently<T, R>(items: readonly T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await map(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
