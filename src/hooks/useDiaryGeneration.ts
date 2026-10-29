import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface DiaryGenerationStatus {
  active: boolean;
  status: "disabled" | "idle" | "queued" | "running" | "succeeded" | "failed";
  generation: number;
  saved_generation: number;
  completed_at: string | null;
  error_code: string | null;
}
export function useDiaryGeneration(date: string, onChange: () => void) {
  const { user } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState<DiaryGenerationStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  const previous = useRef<string | null>(null);
  const latestGeneration = useRef(0);
  const target = useRef(`${userId}:${date}`);
  target.current = `${userId}:${date}`;
  useEffect(() => {
    let cancelled = false;
    previous.current = null;
    latestGeneration.current = 0;
    setStatus(null);
    setUnavailable(false);
    if (!userId) return;
    let inflight = false;
    const poll = async () => {
      if (document.hidden || inflight) return;
      inflight = true;
      const { data, error } = await supabase.rpc("diary_generation_status", {
        p_date: date,
      });
      inflight = false;
      if (cancelled) return;
      if (error) {
        setUnavailable(true);
        return;
      }
      const value = data as unknown as DiaryGenerationStatus;
      if (!value || typeof value.active !== "boolean") {
        setUnavailable(true);
        return;
      }
      if (value.generation < latestGeneration.current) return;
      latestGeneration.current = value.generation;
      setUnavailable(false);
      setStatus(value);
      const signature =
        `${value.generation}:${value.saved_generation}:${value.status}`;
      if (previous.current !== null && previous.current !== signature) {
        callback.current();
      }
      previous.current = signature;
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [date, userId]);
  const request = useCallback(async () => {
    const { data, error } = await supabase.rpc("request_diary_generation", {
      p_date: date,
    });
    if (error) {
      toast.error(
        "日記生成を依頼できませんでした。しばらくしてから再試行してください。",
      );
      return false;
    }
    if (target.current !== `${userId}:${date}`) return false;
    const accepted = data as unknown as DiaryGenerationStatus;
    latestGeneration.current = Math.max(
      latestGeneration.current,
      accepted.generation,
    );
    setStatus(accepted);
    toast.success("日記生成を受け付けました");
    return true;
  }, [date, userId]);
  return {
    status,
    unavailable,
    request,
    busy: status?.status === "queued" || status?.status === "running",
  };
}
