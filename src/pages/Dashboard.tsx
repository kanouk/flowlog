import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEntries, Entry } from '@/hooks/useEntries';
import { FlowView } from '@/components/flow/FlowView';
import { StockView } from '@/components/stock/StockView';
import { DateSelector } from '@/components/flow/DateSelector';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LogOut, Calendar, Settings, Menu, PenLine, FileText } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { getTodayKey } from '@/lib/dateUtils';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/use-mobile';
import logoImage from '@/assets/logo.png';
export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { getEntries } = useEntries();
  
  const [entries, setEntries] = useState<Entry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('flow');
  const isMobile = useIsMobile();
  
  const today = getTodayKey();
  const selectedDate = searchParams.get('date') || today;

  // モバイルでスワイプジェスチャーによるサイドメニュー開閉
  useSwipeGesture({
    onSwipeRight: () => {
      if (isMobile && !sidebarOpen) {
        setSidebarOpen(true);
      }
    },
    onSwipeLeft: () => {
      if (isMobile && sidebarOpen) {
        setSidebarOpen(false);
      }
    },
    minSwipeDistance: 50,
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
    setSidebarOpen(false);
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
            {/* Mobile menu - only show in Flow tab */}
            {activeTab === 'flow' && (
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <SheetHeader>
                    <SheetTitle className="text-left">ログ一覧</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <DateSelector 
                      entries={entries} 
                      onSelect={handleDateSelect}
                      selectedDate={selectedDate}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            
            <div className="flex items-center gap-2">
              <img src={logoImage} alt="FlowLog" className="h-7 w-7" />
              <h1 className="text-xl font-semibold text-gradient">FlowLog</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="flow" className="gap-2">
              <PenLine className="h-4 w-4" />
              Flow
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2">
              <FileText className="h-4 w-4" />
              Stock
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flow" className="mt-0">
            <div className="flex gap-8">
              {/* Sidebar - Desktop (Flow tab only) */}
              <aside className="hidden md:block w-64 flex-shrink-0">
                <div className="sticky top-24 glass-card rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">ログ一覧</span>
                  </div>
                  <DateSelector 
                    entries={entries} 
                    onSelect={handleDateSelect}
                    selectedDate={selectedDate}
                  />
                </div>
              </aside>

              {/* Main FlowView */}
              <main className="flex-1 min-w-0">
                <FlowView 
                  selectedDate={selectedDate} 
                  onNavigateToDate={handleNavigateToDate}
                />
              </main>
            </div>
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
    </div>
  );
}
