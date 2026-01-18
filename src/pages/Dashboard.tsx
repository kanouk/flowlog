import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEntries, Entry } from '@/hooks/useEntries';
import { FlowEditor } from '@/components/flow/FlowEditor';
import { DateList } from '@/components/flow/DateList';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LogOut, Calendar, Settings, Menu, ChevronLeft } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { getTodayKey } from '@/lib/dateUtils';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { getEntries } = useEntries();
  
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const today = getTodayKey();
  const selectedDate = searchParams.get('date') || today;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    async function loadEntries() {
      if (!user) return;
      setLoading(true);
      const data = await getEntries();
      setEntries(data);
      setLoading(false);
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

  if (authLoading || loading) {
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
                  <DateList 
                    entries={entries} 
                    onSelect={handleDateSelect}
                    selectedDate={selectedDate}
                  />
                </div>
              </SheetContent>
            </Sheet>
            
            <h1 className="text-xl font-semibold text-gradient">FlowLog</h1>
          </div>

          <div className="flex items-center gap-2">
            {selectedDate !== today && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleBackToToday}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                今日に戻る
              </Button>
            )}
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
        <div className="flex gap-8">
          {/* Sidebar - Desktop */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <div className="sticky top-24 glass-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">ログ一覧</span>
              </div>
              <DateList 
                entries={entries} 
                onSelect={handleDateSelect}
                selectedDate={selectedDate}
              />
            </div>
          </aside>

          {/* Main editor */}
          <main className="flex-1 min-w-0">
            <FlowEditor 
              date={selectedDate} 
              onNavigateToDate={handleNavigateToDate}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
