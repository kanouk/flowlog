import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEntries, Entry } from '@/hooks/useEntries';
import { FlowView } from '@/components/flow/FlowView';
import { StockView } from '@/components/stock/StockView';
import { DateNavigation } from '@/components/flow/DateNavigation';
import { SearchBar } from '@/components/search/SearchBar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Settings, PenLine, FileText } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { getTodayKey } from '@/lib/dateUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import logoImage from '@/assets/logo.png';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { getEntries } = useEntries();
  
  const [entries, setEntries] = useState<Entry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('flow');
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const isMobile = useIsMobile();
  
  const today = getTodayKey();
  const selectedDate = searchParams.get('date') || today;
  const targetBlockId = searchParams.get('block');

  // カレンダー用：エントリがある日付のリスト
  const datesWithEntries = useMemo(() => {
    return entries.map(e => e.date);
  }, [entries]);

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

  const handleBackToToday = () => {
    setSearchParams({});
  };

  const handleLogoClick = () => {
    setSearchParams({});
    setActiveTab('flow');
  };

  const handleSearchNavigate = (targetDate: string, tab?: 'flow' | 'stock', blockId?: string, query?: string) => {
    const params: Record<string, string> = {};
    if (targetDate !== today) {
      params.date = targetDate;
    }
    if (blockId) {
      params.block = blockId;
    }
    setSearchParams(params);
    if (tab) {
      setActiveTab(tab);
    }
    if (query) {
      setSearchQuery(query);
    }
  };

  const handleBlockScrolled = () => {
    // スクロール完了後、blockパラメータをURLから削除
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('block');
    setSearchParams(newParams);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // 初回ロード時のみフルローディング画面を表示
  if (authLoading || (initialLoading && entries.length === 0)) {
    return (
      <div className="min-h-screen flow-gradient flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flow-gradient">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleLogoClick}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img src={logoImage} alt="FlowLog" className="h-7 w-7" />
              <h1 className="text-xl font-semibold text-gradient hidden sm:block">FlowLog</h1>
            </button>
            
            {/* Date Navigation - Flow tab only */}
            {activeTab === 'flow' && (
              <DateNavigation
                selectedDate={selectedDate}
                onDateChange={handleDateSelect}
                datesWithEntries={datesWithEntries}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <SearchBar onNavigateToDate={handleSearchNavigate} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className={`container max-w-4xl mx-auto px-4 py-8 ${isMobile ? 'pb-24' : ''}`}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Desktop tabs - hidden on mobile */}
          {!isMobile && (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="flow" className="gap-1.5 whitespace-nowrap">
                <PenLine className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">Flow</span>
              </TabsTrigger>
              <TabsTrigger value="stock" className="gap-1.5 whitespace-nowrap">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">Stock</span>
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="flow" className="mt-0">
            <FlowView 
              selectedDate={selectedDate} 
              onNavigateToDate={handleNavigateToDate}
              targetBlockId={targetBlockId}
              onBlockScrolled={handleBlockScrolled}
              searchQuery={searchQuery}
              onSearchCleared={() => setSearchQuery(null)}
            />
          </TabsContent>

          <TabsContent value="stock" className="mt-0">
            <StockView 
              entries={entries}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border safe-area-bottom">
          <div className="flex h-16">
            <button
              onClick={() => setActiveTab('flow')}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                activeTab === 'flow' 
                  ? 'text-primary' 
                  : 'text-muted-foreground active:scale-95'
              }`}
            >
              <PenLine className={`h-5 w-5 transition-transform duration-200 ${activeTab === 'flow' ? 'scale-110' : ''}`} />
              <span className="text-xs font-medium">Flow</span>
              {activeTab === 'flow' && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('stock')}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                activeTab === 'stock' 
                  ? 'text-primary' 
                  : 'text-muted-foreground active:scale-95'
              }`}
            >
              <FileText className={`h-5 w-5 transition-transform duration-200 ${activeTab === 'stock' ? 'scale-110' : ''}`} />
              <span className="text-xs font-medium">Stock</span>
              {activeTab === 'stock' && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
