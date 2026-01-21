import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ChevronLeft, User, LogOut, Loader2 } from 'lucide-react';
import { AISettingsSection } from '@/components/settings/AISettingsSection';
import { ScoreSettingsSection } from '@/components/settings/ScoreSettingsSection';

export default function Settings() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flow-gradient flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const isAnonymous = user.is_anonymous;

  return (
    <div className="min-h-screen flow-gradient">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 h-16 flex items-center gap-4">
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

      {/* Main content */}
      <main className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Score Settings section */}
        <ScoreSettingsSection />

        {/* AI Settings section */}
        <AISettingsSection />

        {/* Account section */}
        <section className="glass-card rounded-2xl p-6 space-y-4">
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
        </section>

        {/* Sign out */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          ログアウト
        </Button>
      </main>
    </div>
  );
}