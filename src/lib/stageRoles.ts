/**
 * Stable pipeline-stage "roles".
 *
 * Pipeline stages are user-editable DATA (see PipelineStage): a founder can
 * rename or delete any stage from the UI. Code must therefore NEVER match a
 * stage by its human-facing display `name`, or renaming the seeded "Meeting"
 * stage to "Demo booked" would silently no-op stage movement and zero the
 * funnel meeting metric.
 *
 * Instead, machine-significant stages carry a stable `role` string that the
 * seed sets and the code keys off. `role` is nullable/back-compatible: stages
 * without special behavior leave it null.
 *
 * `SEED_STAGE_NAME_BY_ROLE` is a *fallback* used only when no stage carries the
 * role yet (e.g. a DB seeded before the `role` column existed). It maps each
 * role to the name the seed originally shipped so resolution still works on
 * older data.
 */

export type StageRole = "contacted" | "replied" | "not_interested" | "meeting";

/** Original seed display names, used only as a fallback when `role` is unset. */
export const SEED_STAGE_NAME_BY_ROLE: Record<StageRole, string> = {
  contacted: "Contacted",
  replied: "Replied",
  not_interested: "Not Interested",
  meeting: "Meeting",
};
