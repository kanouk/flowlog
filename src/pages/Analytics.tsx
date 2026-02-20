import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalytics, type PeriodDays } from '@/hooks/useAnalytics';
import { format, parseISO } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  event: '#3B82F6',
  task: '#F97316',
  schedule: '#06B6D4',
  thought: '#A855F7',
  read_later: '#22C55E',
};

const CATEGORY_LABELS: Record<string, string> = {
  event: 'ジャーナル',
  task: 'タスク',
  schedule: 'スケジュール',
  thought: 'メモ',
  read_later: 'あとで読む',
};

const PERIOD_OPTIONS: { label: string; value: PeriodDays }[] = [
  { label: '7日', value: 7 },
  { label: '30日', value: 30 },
  { label: '90日', value: 90 },
];

function formatDateAxis(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'M/d');
  } catch {
    return dateStr;
  }
}

export default function Analytics() {
  const navigate = useNavigate();
  const [days, setDays] = useState<PeriodDays>(30);
  const { scoreData, categoryData, dailyActivity, isLoading } = useAnalytics(days);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">アナリティクス</h1>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Period selector */}
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={days === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">読み込み中...</p>
        ) : (
          <>
            {/* Score trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">スコア推移</CardTitle>
              </CardHeader>
              <CardContent>
                {scoreData.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">スコアデータがありません</p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={scoreData}>
                      <XAxis dataKey="date" tickFormatter={formatDateAxis} fontSize={12} />
                      <YAxis domain={[0, 100]} fontSize={12} />
                      <Tooltip
                        labelFormatter={formatDateAxis}
                        formatter={(value: number) => [`${value}点`, 'スコア']}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Category distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">カテゴリ別投稿数</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryData.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">データがありません</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="count"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ category, count }) => `${CATEGORY_LABELS[category] || category} (${count})`}
                        labelLine
                      >
                        {categoryData.map((entry) => (
                          <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] || '#888'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string) => [value, CATEGORY_LABELS[name] || name]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Daily activity */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">日別投稿数</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyActivity.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">データがありません</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dailyActivity}>
                      <XAxis dataKey="date" tickFormatter={formatDateAxis} fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={formatDateAxis}
                        formatter={(value: number, name: string) => [value, CATEGORY_LABELS[name] || name]}
                      />
                      <Legend formatter={(value) => CATEGORY_LABELS[value] || value} />
                      {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                        <Bar key={cat} dataKey={cat} stackId="a" fill={color} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
