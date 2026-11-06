import { Loader2 } from "lucide-react";
import type { DiaryGenerationStatus } from "@/hooks/useDiaryGeneration";
import { Button } from "@/components/ui/button";
export function DiaryGenerationState(
  { status, unavailable, onRetry }: {
    status: DiaryGenerationStatus | null;
    unavailable: boolean;
    onRetry: () => void;
  },
) {
  if (unavailable) {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        日記生成の状態を取得できません
      </span>
    );
  }
  if (!status) return null;
  const labels: Record<DiaryGenerationStatus["status"], string> = {
    disabled: status.scope_reason === 'protected_date'
      ? '過去の日記は保護されています（自動生成の対象外）'
      : status.scope_reason === 'awaiting_new_record'
        ? '新しく追加する出来事から日記を自動生成します'
        : "日記の自動生成は停止中",
    idle: "",
    queued: "日記生成待ち",
    running: "日記生成中",
    succeeded: "日記更新済み",
    failed: status.error_code === "daily_budget"
      ? "日記生成の本日の上限に達しました"
      : "日記生成に失敗しました",
  };
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
    >
      {(status.status === "queued" || status.status === "running") && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {labels[status.status]}
      {status.status === "failed" && status.error_code !== "daily_budget" && (
        <Button size="sm" variant="ghost" onClick={onRetry}>再試行</Button>
      )}
    </span>
  );
}
