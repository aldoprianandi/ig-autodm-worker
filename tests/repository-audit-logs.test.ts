import { describe, expect, it } from "vitest";
import { Repository } from "../src/db/repository";

describe("Repository admin audit log listing", () => {
  it("clamps non-numeric limits to the default instead of binding NaN", async () => {
    const db = createAuditLogDb();
    const repo = new Repository(db as never);

    await expect(repo.listAdminAuditLogs(Number.NaN)).resolves.toEqual([]);
    expect(db.boundLimits).toEqual([50]);
  });

  it("clamps out-of-range limits into the allowed window", async () => {
    const db = createAuditLogDb();
    const repo = new Repository(db as never);

    await repo.listAdminAuditLogs(0);
    await repo.listAdminAuditLogs(10_000);

    expect(db.boundLimits).toEqual([1, 100]);
  });
});

function createAuditLogDb() {
  const db = {
    boundLimits: [] as unknown[],
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          if (sql.includes("FROM admin_audit_logs")) {
            db.boundLimits.push(params[0]);
          }
          return {
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  };

  return db;
}
