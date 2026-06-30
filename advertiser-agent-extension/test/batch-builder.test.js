const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BATCH_TEMPLATE_COLUMNS,
  batchRowsToCsv,
  buildTemplateRows,
  normalizeProgramItems,
  parseOrganizationIds,
  selectOwnerOrAdminUser
} = require("../batch-builder");

test("parses and dedupes single and bulk organisation IDs", () => {
  assert.deepEqual(
    parseOrganizationIds(
      "2384712",
      "organizationId=2384712&limit=100",
      "111\n222, 111;333"
    ),
    ["2384712", "111", "222", "333"]
  );
});

test("chooses owner role before admin role", () => {
  const selected = selectOwnerOrAdminUser({
    items: [
      { username: "admin_user", roleId: 2 },
      { username: "owner_user", roleId: 1 }
    ]
  });
  assert.equal(selected.username, "owner_user");
  assert.equal(selected.roleId, 1);
});

test("falls back to admin role when no owner exists", () => {
  const selected = selectOwnerOrAdminUser([
    { username: "viewer_user", roleId: 3 },
    { username: "admin_user", roleId: 2 }
  ]);
  assert.equal(selected.username, "admin_user");
  assert.equal(selected.roleId, 2);
});

test("fails clearly when no owner or admin exists", () => {
  assert.throws(
    () => selectOwnerOrAdminUser({ items: [{ username: "viewer_user", roleId: 3 }] }),
    /No owner or admin user/
  );
});

test("normalizes active programs and builds template rows", () => {
  const programs = normalizeProgramItems({
    items: [
      { id: "200", name: "Inactive", active: false },
      { programId: "100", programName: "Alpha", active: true },
      { programId: "300", name: "Beta", active: true }
    ]
  });
  const rows = buildTemplateRows(
    [
      {
        clientUsername: "owner_user",
        programs,
        selectedProgramIds: ["100", "300"]
      }
    ],
    {
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      currencyCode: "GBP",
      languageCode: "EN"
    }
  );

  assert.deepEqual(Object.keys(rows[0]), BATCH_TEMPLATE_COLUMNS);
  assert.deepEqual(rows, [
    {
      clientUsername: "owner_user",
      programIds: "100;300",
      programNames: "Alpha;Beta",
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      currencyCode: "GBP",
      languageCode: "EN"
    }
  ]);
});

test("generates CSV with only template columns and escapes cells", () => {
  const csv = batchRowsToCsv([
    {
      clientUsername: "owner_user",
      programIds: "100;300",
      programNames: "Alpha, Inc;Beta \"Plus\"\nLine",
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      currencyCode: "GBP",
      languageCode: "EN",
      organizationId: "must-not-export"
    }
  ]);

  assert.equal(
    csv,
    [
      "clientUsername,programIds,programNames,startDate,endDate,currencyCode,languageCode",
      "owner_user,100;300,\"Alpha, Inc;Beta \"\"Plus\"\"\nLine\",2026-01-01,2026-03-31,GBP,EN"
    ].join("\r\n")
  );
});
