import "server-only";
import { MondayReadClient } from "../monday/client";
import { fetchSnapshot, sourceConfigFromEnv } from "../monday/source";
import type { Repo } from "../data/repo";
import type { SyncRun } from "../types";
import { buildPortfolio } from "../rules/engine";
import { newRuleSuggestions } from "./suggest";
export { riskToSuggestion } from "./suggest";
import { diffSnapshots } from "./diff";
import { suggestMappings } from "./mapping";
import { sheetsConfigured } from "../sheets/google";
import { fetchSheetUnits } from "../sheets/fetch";

/**
 * Automation A (sync) + B (risk monitoring) + rule-based task suggestions.
 * Incremental: re-reads client/property boards and only the setup boards updated since the last success.
 * Full (nightly): re-reads everything and reconciles deletions.
 */
export async function runSync(repo: Repo, kind: "incremental" | "full", log: (m: string) => void = () => {}): Promise<SyncRun> {
  const run: SyncRun = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), finishedAt: null, kind, status: "running", itemsRead: 0, changes: 0, errors: [] };
  await repo.saveSyncRun(run);
  try {
    const [prev, rules, runs, cs] = await Promise.all([repo.getSnapshot(), repo.getRules(), repo.getSyncRuns(20), repo.getCsState()]);
    const lastSuccess = runs.find((r) => r.status === "success" && r.finishedAt)?.startedAt ?? null;
    const hasPrev = prev.clients.length > 0;

    if (repo.mode === "demo") {
      log("demo mode: no monday.com connection; re-evaluating rules on synthetic data");
      const views = buildPortfolio(prev, cs, await repo.getChanges(), rules, new Date());
      await repo.saveSuggestions(newRuleSuggestions(views, cs), "system");
      Object.assign(run, { status: "success", finishedAt: new Date().toISOString(), itemsRead: prev.clients.length + prev.tasks.length });
      await repo.saveSyncRun(run);
      return run;
    }

    const client = new MondayReadClient({ token: process.env.MONDAY_API_TOKEN ?? "" });
    const { snapshot, errors, skippedBoardIds } = await fetchSnapshot(client, sourceConfigFromEnv(), rules, {
      onlyBoardsUpdatedAfter: kind === "incremental" && hasPrev ? lastSuccess : null,
      log,
    });
    // Keep tasks of boards we didn't need to re-read
    const skipped = new Set(skippedBoardIds);
    snapshot.tasks.push(...prev.tasks.filter((t) => skipped.has(t.boardId)));
    run.itemsRead = snapshot.clients.length + snapshot.units.length + snapshot.tasks.length;
    run.errors = errors;

    const mappings = cs.mappings.filter((m) => m.status !== "rejected");
    const clientsForBoard = (boardId: string) => mappings.filter((m) => m.boardId === boardId).map((m) => m.clientId);
    const events = diffSnapshots(hasPrev ? prev : null, snapshot, clientsForBoard);

    await repo.replaceSource(snapshot, { reconcile: kind === "full" && errors.length === 0 });
    run.changes = await repo.appendChanges(events);

    // New board ↔ client link suggestions (never auto-confirmed)
    const newMaps = suggestMappings(snapshot, cs.mappings);
    for (const m of newMaps) await repo.saveMapping(m, { id: "system", email: "system", name: "system", role: "admin" });

    // Rule-based CS task suggestions (pending until CS approves)
    const changes = await repo.getChanges();
    const views = buildPortfolio(snapshot, { ...cs, mappings: [...cs.mappings, ...newMaps] }, changes, rules, new Date());
    await repo.saveSuggestions(newRuleSuggestions(views, cs), "system");

    // Rent sheet (Google Sheets, read-only). Optional; its failure never blocks the Monday sync.
    if (sheetsConfigured()) {
      try {
        const sheet = await fetchSheetUnits(process.env.RENT_SHEET_ID!);
        if (sheet.units.length) await repo.replaceSheetUnits(sheet);
        else sheet.errors.push("Rent sheet returned no units; kept the previous copy.");
        log(`rent sheet: ${sheet.units.length} units`);
        run.errors.push(...sheet.errors.map((e) => `Rent sheet · ${e}`));
      } catch (e) {
        run.errors.push(`Rent sheet: ${(e as Error).message}`);
      }
    }

    run.status = run.errors.length ? "partial" : "success";
  } catch (e) {
    run.status = "failed";
    run.errors.push((e as Error).message);
  }
  run.finishedAt = new Date().toISOString();
  await repo.saveSyncRun(run);
  await repo.audit("system", `sync:${run.status}`, "sync_runs", `${run.kind} read=${run.itemsRead} changes=${run.changes} errors=${run.errors.length}`);
  return run;
}

