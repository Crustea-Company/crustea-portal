import { describe, expect, it } from "vitest";
import { buildWorkbook, diffRows, parseWorkbook, rowValues } from "@/lib/bulk-sheet";
import { taskInputFromValues, taskSheetDef, taskSheetPeople, type TaskSheetCtx } from "@/lib/bulk-tasks";
import type { Task } from "@/lib/tasks";

const ctx: TaskSheetCtx = {
  employees: [
    { id: "e1", full_name: "Budi Santoso" },
    { id: "e2", full_name: "Siti Aminah" },
  ],
  departments: [{ code: "CA", name: "Corporate Affairs" }, { code: "TO", name: "TechOps" }],
  sprints: [{ id: 7, name: "Sprint 7" }],
  programs: [{ id: "pg1", name: "Program A" }],
};
const task: Task = {
  id: "t1", code: "CA-1", dept_code: "CA", title: "Susun laporan", workstream: null, output: null, status: "on_going",
  start_date: null, deadline: "2026-12-01", is_priority: false, sprint_id: 7, program_id: "pg1", notes: null,
  created_at: "2026-11-01T00:00:00Z", task_people: [{ employee_id: "e1", role: "pic" }, { employee_id: "e2", role: "support" }],
};
const def = taskSheetDef(ctx);

describe("file Excel Tugas", () => {
  it("ekspor lalu impor tanpa mengubah apa pun = 0 perubahan", async () => {
    const wb = await buildWorkbook(def, [task], { exportedAt: "x", exportedBy: "y" });
    const parsed = await parseWorkbook(def, (await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const items = diffRows(def, parsed, new Map([[task.id, rowValues(def, task)]]), { people: taskSheetPeople(ctx) });
    expect(items.map((i) => i.action)).toEqual(["none"]);
  });

  it("nilai baris -> isian tugas (status, sprint, program, PIC, support)", () => {
    const res = taskInputFromValues(rowValues(def, task), ctx);
    expect(res).toMatchObject({ input: { dept_code: "CA", status: "on_going", sprint_id: 7, program_id: "pg1", pics: ["e1"], supports: ["e2"], deadline: "2026-12-01", is_priority: false } });
  });

  it("nama sprint / PIC tak dikenal -> masalah, tidak menebak", () => {
    const v = { ...rowValues(def, task), Sprint: "Sprint 99", PIC: "Orang Asing" };
    const res = taskInputFromValues(v, ctx);
    expect("problems" in res && res.problems.length).toBe(2);
  });
});
