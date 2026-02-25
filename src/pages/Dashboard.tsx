import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEntries, Entry } from '@/hooks/useEntries';
import { FlowView } from '@/components/flow/FlowView';
import { JournalView } from '@/components/stock/JournalView';
import { TasksView } from '@/components/stock/TasksView';
import { ScheduleView } from '@/components/stock/ScheduleView';
import { MemosView } from '@/components/stock/MemosView';
import { ReadLaterView } from '@/components/stock/ReadLaterView';
import { SearchBar } from '@/components/search/SearchBar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Settings, PenLine, BookOpen, ListTodo, CalendarClock, Brain, Bookmark, BarChart3 } from 'lucide-react';
import { AppSplash } from '@/components/common/AppSplash';
import { getTodayKey } from '@/lib/dateUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTabSwipe } from '@/hooks/useTabSwipe';
import logoImage from '@/assets/logo.png';

type DashboardTab = 'flow' | 'journal' | 'tasks' | 'schedule' | 'memos' | 'readLater';

const TAB_ORDER: DashboardTab[] = ['flow', 'journal', 'tasks', 'schedule', 'memos', 'readLater'];

const TAB_CONFIG: Record<DashboardTab, { label: string; icon: typeof PenLine; activeColor: string; hoverColor: string }> = {
  flow: { label: '入力', icon: PenLine, activeColor: 'text-primary', hoverColor: '' },
  journal: { label: '日記', icon: BookOpen, activeColor: 'text-blue-500', hoverColor: 'hover:text-blue-500' },
  tasks: { label: 'タスク', icon: ListTodo, activeColor: 'text-orange-500', hoverColor: 'hover:text-orange-500' },
  schedule: { label: '予定', icon: CalendarClock, activeColor: 'text-cyan-500', hoverColor: 'hover:text-cyan-500' },
  memos: { label: 'メモ', icon: Brain, activeColor: 'text-purple-500', hoverColor: 'hover:text-purple-500' },
  readLater: { label: 'あとで読む', icon: Bookmark, activeColor: 'text-green-500', hoverColor: 'hover:text-green-500' },
};

const TAB_DOT_COLORS: Record<DashboardTab, string> = {
  flow: 'bg-primary',
  journal: 'bg-blue-500',
  tasks: 'bg-orange-500',
  schedule: 'bg-cyan-500',
  memos: 'bg-purple-500',
  readLater: 'bg-green-500',
};

// カテゴリからタブへのマッピング
const categoryToTab = (category: string): DashboardTab => {
  switch (category) {
    case 'task': return 'tasks';
    case 'memo': return 'memos';
    case 'schedule': return 'schedule';
    case 'read_later': return 'readLater';
    default: return 'flow';
  }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { getEntries } = useEntries();
  
  const [entries, setEntries] = useState<Entry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('flow');
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const isMobile = useIsMobile();
  
  const today = getTodayKey();
  const selectedDate = searchParams.get('date') || today;
  const targetBlockId = searchParams.get('block');

  const datesWithEntries = useMemo(() => {
    return entries.map(e => e.date);
  }, [entries]);

  // 6タブ間スワイプ
  const goToNextTab = useCallback(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
  }, [activeTab]);

  const goToPrevTab = useCallback(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  }, [activeTab]);

  useTabSwipe({
    onSwipeLeft: goToNextTab,
    onSwipeRight: goToPrevTab,
    enabled: isMobile,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    async function loadEntries() {
      if (!user) return;
      const data = await getEntries();
      setEntries(data);
      setInitialLoading(false);
    }
    loadEntries();
  }, [user, getEntries]);

  const handleDateSelect = (date: string) => {
    if (date === today) {
      setSearchParams({});
    } else {
      setSearchParams({ date });
    }
  };

  const handleNavigateToDate = (targetDate: string) => {
    if (targetDate === today) {
      setSearchParams({});
    } else {
      setSearchParams({ date: targetDate });
    }
  };

  const handleLogoClick = () => {
    setSearchParams({});
    setActiveTab('flow');
  };

  const handleSearchNavigate = (targetDate: string, tab?: string, blockId?: string, query?: string) => {
    const params: Record<string, string> = {};
    if (targetDate !== today) {
      params.date = targetDate;
    }
    if (blockId) {
      params.block = blockId;
    }
    setSearchParams(params);
    if (tab) {
      setActiveTab(tab as DashboardTab);
    }
    if (query) {
      setSearchQuery(query);
    }
  };

  const handleBlockScrolled = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('block');
    setSearchParams(newParams);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (authLoading || (initialLoading && entries.length === 0)) {
    return <AppSplash />;
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flow-gradient">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={handleLogoClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src={logoImage} alt="FlowLog" className="h-7 w-7" />
            <h1 className="text-xl font-semibold text-gradient hidden sm:block">FlowLog</h1>
          </button>

          <div className="flex items-center gap-2">
            <SearchBar onNavigateToDate={handleSearchNavigate} />
            <Button variant="ghost" size="icon" onClick={() => navigate('/analytics')}>
              <BarChart3 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className={`container max-w-4xl mx-auto px-4 py-8 ${isMobile ? 'pb-24' : ''}`}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)} className="space-y-6">
          {/* Desktop tabs */}
          {!isMobile && (
            <TabsList className="grid w-full grid-cols-6">
              {TAB_ORDER.map((tab) => {
                const config = TAB_CONFIG[tab];
                const Icon = config.icon;
                const isFlow = tab === 'flow';
                return (
                  <TabsTrigger 
                    key={tab} 
                    value={tab} 
                    className={`gap-1.5 whitespace-nowrap ${
                      isFlow 
                        ? 'text-primary font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md' 
                        : ''
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">{config.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          )}

          <TabsContent value="flow" className="mt-0">
            <FlowView 
              selectedDate={selectedDate} 
              onNavigateToDate={handleNavigateToDate}
              onDateChange={handleDateSelect}
              datesWithEntries={datesWithEntries}
              targetBlockId={targetBlockId}
              onBlockScrolled={handleBlockScrolled}
              searchQuery={searchQuery}
              onSearchCleared={() => setSearchQuery(null)}
            />
          </TabsContent>

          <TabsContent value="journal" className="mt-0">
            <JournalView 
              entries={entries}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
            />
          </TabsContent>

          <TabsContent value="tasks" className="mt-0">
            <TasksView />
          </TabsContent>

          <TabsContent value="schedule" className="mt-0">
            <ScheduleView />
          </TabsContent>

          <TabsContent value="memos" className="mt-0">
            <MemosView />
          </TabsContent>

          <TabsContent value="readLater" className="mt-0">
            <ReadLaterView />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile Bottom Tab Bar - 6 tabs, icons only */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border safe-area-bottom">
          <div className="flex h-16">
            {TAB_ORDER.map((tab) => {
              const config = TAB_CONFIG[tab];
              const Icon = config.icon;
              const isActive = activeTab === tab;
              const isFlow = tab === 'flow';
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                    isFlow ? 'border-r border-border' : ''
                  } ${
                    isActive 
                      ? config.activeColor
                      : 'text-muted-foreground active:scale-95'
                  }`}
                >
                  {isFlow ? (
                    <span className={`rounded-xl p-1.5 transition-transform duration-200 ${
                      isActive 
                        ? 'bg-primary text-primary-foreground scale-110' 
                        : 'bg-primary/10 text-primary'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </span>
                  ) : (
                    <Icon className={`h-5 w-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                  )}
                  {isActive && !isFlow && (
                    <span className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${TAB_DOT_COLORS[tab]}`} />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
