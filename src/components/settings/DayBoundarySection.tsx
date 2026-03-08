import { useState, useEffect } from 'react';
import { Clock, Loader2, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';
import { toast } from 'sonner';

export function DayBoundarySection() {
  const { dayBoundaryHour, loading, saveDayBoundaryHour } = useDayBoundary();
  const [value, setValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!loading) {
      setValue(dayBoundaryHour);
    }
  }, [loading, dayBoundaryHour]);

  useEffect(() => {
    setHasChanges(value !== dayBoundaryHour);
  }, [value, dayBoundaryHour]);

  const handleSave = async () => {
    setSaving(true);
    const success = await saveDayBoundaryHour(value);
    if (success) {
      toast.success('設定を保存しました');
    } else {
      toast.error('保存に失敗しました');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        1日の区切り
      </h2>

      {/* Explanation */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-foreground/80 space-y-1">
          <p>指定した時刻より前の記録は前日の日記に入ります。</p>
          <p className="text-muted-foreground">
            例えば 5:00 にすると、1:30 の記録は前日の 25:30 として扱います。
          </p>
        </div>
      </div>

      {/* Slider */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">区切り時刻</span>
          <span className="text-lg font-semibold text-foreground tabular-nums">
            {value === 0 ? '0:00（デフォルト）' : `${value}:00`}
          </span>
        </div>
        <Slider
          value={[value]}
          onValueChange={([v]) => setValue(v)}
          min={0}
          max={12}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
        </div>
      </div>

      {/* Preview */}
      {value > 0 && (
        <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground space-y-1">
          <p>• 0:00〜{value}:00 の記録 → 前日の生活日に所属</p>
          <p>• 時刻表示: 0:30 → {24}:30, {value - 1}:30 → {24 + value - 1}:30</p>
        </div>
      )}

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="w-full gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            保存中...
          </>
        ) : hasChanges ? (
          '設定を保存'
        ) : (
          <>
            <Check className="h-4 w-4" />
            保存済み
          </>
        )}
      </Button>
    </section>
  );
}
