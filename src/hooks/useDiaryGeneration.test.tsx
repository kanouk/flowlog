import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock(
  "@/integrations/supabase/client",
  () => ({ supabase: { rpc: mocks.rpc } }),
);
vi.mock(
  "@/hooks/useAuth",
  () => ({ useAuth: () => ({ user: { id: "synthetic-owner" } }) }),
);
vi.mock(
  "sonner",
  () => ({ toast: { success: mocks.success, error: mocks.error } }),
);
import { useDiaryGeneration } from "./useDiaryGeneration";
const state = (status: string, generation = 1, saved_generation = 0) => ({
  active: true,
  status,
  generation,
  saved_generation,
  completed_at: null,
  error_code: null,
});
beforeEach(() => {
  vi.useFakeTimers();
  mocks.rpc.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  vi.useRealTimers();
});
describe("server diary observer", () => {
  it("reads state, refreshes after server changes and only enqueues manual retries", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: state("queued"), error: null })
      .mockResolvedValueOnce({ data: state("running"), error: null })
      .mockResolvedValueOnce({ data: state("succeeded", 1, 1), error: null })
      .mockResolvedValue({ data: state("queued", 2, 1), error: null });
    const changed = vi.fn();
    const hook = renderHook(() => useDiaryGeneration("2026-09-20", changed));
    await act(async () => {});
    expect(hook.result.current.busy).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(changed).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(hook.result.current.busy).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    await act(async () => {
      await hook.result.current.request();
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("request_diary_generation", {
      p_date: "2026-09-20",
    });
    expect(
      mocks.rpc.mock.calls.every(([name]) =>
        ["diary_generation_status", "request_diary_generation"].includes(name)
      ),
    ).toBe(true);
  });
  it("ignores an old-day read that resolves after navigation", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.rpc.mockReturnValueOnce(
      new Promise((r) => {
        resolveOld = r;
      }),
    ).mockResolvedValue({ data: state("succeeded", 4, 4), error: null });
    const changed = vi.fn();
    const hook = renderHook(({ date }) => useDiaryGeneration(date, changed), {
      initialProps: { date: "2026-09-20" },
    });
    hook.rerender({ date: "2026-09-21" });
    await act(async () => {});
    await act(async () => {
      resolveOld({ data: state("running"), error: null });
    });
    expect(hook.result.current.status?.generation).toBe(4);
    expect(changed).not.toHaveBeenCalled();
  });
  it("shows unavailable or disabled instead of claiming generation succeeded", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "not deployed" },
    }).mockResolvedValue({
      data: { ...state("disabled"), active: false },
      error: null,
    });
    const hook = renderHook(() => useDiaryGeneration("2026-09-20", () => {}));
    await act(async () => {});
    expect(hook.result.current.unavailable).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(hook.result.current.status?.active).toBe(false);
    expect(hook.result.current.busy).toBe(false);
  });
});
