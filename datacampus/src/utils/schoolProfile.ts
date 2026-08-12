export const SCHOOL_PROFILE = {
  id: "zut",
  shortName: "ZUT",
  name: "Zambia University College of Technology",
  location: "Zambia",
  defaultProgram: "Information Technology",
  workspaceFocus: "final year project proposals and related academic documents",
};

export function normalizeSchoolName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/university college of technology/g, "uct")
    .replace(/zambia/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isZutSchool(value: string | null | undefined) {
  const normalized = normalizeSchoolName(value);
  return normalized === "zut" || normalized === "z u t" || normalized.includes("zut") || normalized.includes("uct");
}

export function buildZutProposalGuardrails() {
  return [
    `${SCHOOL_PROFILE.name} (${SCHOOL_PROFILE.shortName}) is the target institution for this workspace.`,
    `Draft for ${SCHOOL_PROFILE.shortName} academic expectations only; do not reference another school unless the user explicitly asks.`,
    "The uploaded structured proposal spec (chapters, sections, numbering) is the sole source of truth for required structure. There is no separate sample proposal to imitate — write original, submission-ready content directly from the spec and the project's own details.",
    "Use the project title to infer a realistic academic direction when details are sparse, but do not invent fake field data such as student IDs, supervisor names, or exact budgets.",
    "For proposal chapters, aim for submission-ready structure: precise headings, practical academic tone, realistic scope, and clear problem-objective-method alignment.",
  ].join("\n");
}
