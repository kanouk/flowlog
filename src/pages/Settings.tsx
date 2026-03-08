import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ChevronLeft, User, LogOut, Tag, Target, ChevronRight, Plug, Bot, Settings2, Clock } from 'lucide-react';
import { ScoreSettingsSection } from '@/components/settings/ScoreSettingsSection';
import { TagManagementSection } from '@/components/settings/TagManagementSection';
import { McpSettingsSection } from '@/components/settings/McpSettingsSection';
import { AIModelManagementSection } from '@/components/settings/AIModelManagementSection';
import { AIFeatureSettingsSection } from '@/components/settings/AIFeatureSettingsSection';
import { DayBoundarySection } from '@/components/settings/DayBoundarySection';
import { DayBoundaryProvider } from '@/contexts/DayBoundaryContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { AppSplash } from '@/components/common/AppSplash';

type SettingsSection = 'tags' | 'models' | 'features' | 'score' | 'dayBoundary' | 'mcp' | 'account';

const SECTIONS: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
  { id: 'tags', label: 'タグ管理', icon: Tag },
  { id: 'models', label: '生成AIモデル管理', icon: Bot },
  { id: 'features', label: '処理別AI設定', icon: Settings2 },
  { id: 'score', label: '今日の得点', icon: Target },
  { id: 'dayBoundary', label: '1日の区切り', icon: Clock },
  { id: 'mcp', label: 'MCP連携', icon: Plug },
  { id: 'account', label: 'アカウント', icon: User },
];

function SettingsContent() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<SettingsSection>('tags');
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleSectionClick = (section: SettingsSection) => {
    setActiveSection(section);
    if (isMobile) {
      setShowContent(true);
    }
  };

  const handleBackToMenu = () => {
    setShowContent(false);
  };

  if (loading) {
    return <AppSplash />;
  }

  if (!user) return null;

  const isAnonymous = user.is_anonymous;

  const renderSidebar = () => (
    <nav className="space-y-1">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        return (
          <button
            key={section.id}
            onClick={() => handleSectionClick(section.id)}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-all',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5" />
              <span>{section.label}</span>
            </div>
            {isMobile && <ChevronRight className="h-4 w-4" />}
          </button>
        );
      })}
    </nav>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'tags':
        return (
          <section className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-medium flex items-center gap-2 mb-6">
              <Tag className="h-5 w-5 text-primary" />
              タグ管理
            </h2>
            <TagManagementSection />
          </section>
        );
      case 'models':
        return <AIModelManagementSection />;
      case 'features':
        return <AIFeatureSettingsSection />;
      case 'score':
        return <ScoreSettingsSection />;
      case 'dayBoundary':
        return <DayBoundarySection />;
      case 'mcp':
        return <McpSettingsSection />;
      case 'account':
        return (
          <section className="space-y-6">
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                アカウント
              </h2>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">ステータス</span>
                  <span className="font-medium">
                    {isAnonymous ? '匿名ユーザー' : 'メールアカウント'}
                  </span>
                </div>
                
                {!isAnonymous && user.email && (
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">メールアドレス</span>
                    <span className="font-medium">{user.email}</span>
                  </div>
                )}
              </div>

              {isAnonymous && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  匿名ユーザーのデータは、ログアウトすると失われます。データを保持したい場合は、メールアドレスでアカウントを作成してください。
                </p>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              ログアウト
            </Button>
          </section>
        );
      default:
        return null;
    }
  };

  if (isMobile) {
    return (
      <div className="min-h-screen flow-gradient">
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
          <div className="container max-w-2xl mx-auto px-4 h-16 flex items-center gap-4">
            {showContent ? (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleBackToMenu}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/dashboard')}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-xl font-semibold">
              {showContent ? SECTIONS.find(s => s.id === activeSection)?.label : '設定'}
            </h1>
          </div>
        </header>

        <main className="container max-w-2xl mx-auto px-4 py-6">
          {showContent ? renderContent() : renderSidebar()}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flow-gradient">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">設定</h1>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          <aside className="w-56 flex-shrink-0">
            <div className="sticky top-24">
              {renderSidebar()}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Settings() {
  return (
    <DayBoundaryProvider>
      <SettingsContent />
    </DayBoundaryProvider>
  );
}
