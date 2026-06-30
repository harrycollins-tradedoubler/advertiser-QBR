(function attachBatchBuilder(root) {
  const BATCH_TEMPLATE_COLUMNS = [
    "clientUsername",
    "programIds",
    "programNames",
    "startDate",
    "endDate",
    "currencyCode",
    "languageCode"
  ];

  function extractArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return payload.items;
    for (const key of ["users", "programs", "results", "data", "content", "list"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object" && Array.isArray(value.items)) return value.items;
    }
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function parseOrganizationIds(...inputs) {
    const seen = new Set();
    const ids = [];
    for (const input of inputs.flat(Infinity)) {
      const tokens = String(input || "").split(/[\s,;]+/).filter(Boolean);
      for (const token of tokens) {
        const organizationMatch = token.match(/(?:organizationId|organisationId)\s*=\s*(\d+)/i);
        const plainMatch = token.match(/^\d+$/);
        const id = organizationMatch ? organizationMatch[1] : plainMatch ? plainMatch[0] : "";
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    return ids;
  }

  function selectOwnerOrAdminUser(usersPayload) {
    const users = extractArray(usersPayload);
    const candidates = users
      .filter((user) => Number(user?.roleId) === 1 || Number(user?.roleId) === 2)
      .sort((left, right) => Number(left.roleId) - Number(right.roleId));
    const selected = candidates[0];
    if (!selected) throw new Error("No owner or admin user found for organisation.");
    const username = String(selected.username || "").trim();
    if (!username) throw new Error("Owner/admin user did not include a username.");
    return {
      ...selected,
      username,
      roleId: Number(selected.roleId)
    };
  }

  function normalizeProgramItems(programsPayload) {
    return extractArray(programsPayload)
      .filter((item) => item?.active === true)
      .map((item) => {
        const id = String(item.programId || item.id || "").trim();
        const name = String(item.name || item.programName || (id ? `Program ${id}` : "")).trim();
        const countryCode = item.countryCode ? String(item.countryCode).trim().toUpperCase() : "";
        return {
          id,
          name,
          ...(countryCode ? { countryCode } : {})
        };
      })
      .filter((item) => item.id)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function batchRowsToCsv(rows) {
    const lines = [BATCH_TEMPLATE_COLUMNS.map(csvCell).join(",")];
    for (const row of rows) {
      lines.push(BATCH_TEMPLATE_COLUMNS.map((column) => csvCell(row[column])).join(","));
    }
    return lines.join("\r\n");
  }

  function selectedProgramsForResolvedItem(item) {
    const selectedIds = new Set((item.selectedProgramIds || []).map((id) => String(id)));
    return (item.programs || []).filter((program) => selectedIds.has(String(program.id)));
  }

  function buildTemplateRows(resolvedItems, defaults = {}) {
    return (resolvedItems || [])
      .filter((item) => item && !item.error)
      .map((item) => {
        const selectedPrograms = selectedProgramsForResolvedItem(item);
        return {
          clientUsername: item.clientUsername || item.username || "",
          programIds: selectedPrograms.map((program) => program.id).join(";"),
          programNames: selectedPrograms.map((program) => program.name).join(";"),
          startDate: defaults.startDate || "",
          endDate: defaults.endDate || "",
          currencyCode: defaults.currencyCode || "EUR",
          languageCode: defaults.languageCode || "EN"
        };
      })
      .filter((row) => row.clientUsername && row.programIds);
  }

  const api = {
    BATCH_TEMPLATE_COLUMNS,
    batchRowsToCsv,
    buildTemplateRows,
    csvCell,
    extractArray,
    normalizeProgramItems,
    parseOrganizationIds,
    selectOwnerOrAdminUser,
    selectedProgramsForResolvedItem
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AdvertiserBatchBuilder = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
