import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowRight, PenLine, Sparkles, Clock, Loader2 } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flow-gradient flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flow-gradient">
      {/* Header */}
      <header className="p-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gradient">FlowLog</h1>
        <Button 
          variant="ghost" 
          onClick={() => navigate('/auth')}
          className="gap-2"
        >
          ログイン
          <ArrowRight className="h-4 w-4" />
        </Button>
      </header>

      {/* Hero */}
      <main className="container max-w-4xl mx-auto px-6 py-12 md:py-20">
        <div className="text-center space-y-6 animate-fade-up">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground leading-tight">
            思い浮かんだ順に
            <br />
            書いていい。
          </h2>
          <p className="text-xl md:text-2xl text-gradient font-medium">
            読むときは、AIが整える。
          </p>
          <p className="text-muted-foreground max-w-md mx-auto">
            FlowLogは、思考の流れをそのまま書き留めて、
            あとからAIが読みやすく整形してくれる新しい日記アプリです。
          </p>
          
          <div className="pt-4">
            <Button 
              size="lg" 
              onClick={() => navigate('/auth')}
              className="gap-2 text-lg px-8 h-14 rounded-2xl"
            >
              はじめる
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-20">
          {[
            {
              icon: PenLine,
              title: 'フローで書く',
              description: '思いついた順にポンポン書ける。順番は気にしなくていい。',
            },
            {
              icon: Sparkles,
              title: 'AIが整形',
              description: '時系列に並び替え、自然な文章に。3行まとめも自動生成。',
            },
            {
              icon: Clock,
              title: 'あとから振り返る',
              description: '日付ごとに保存。いつでも過去のログを読み返せる。',
            },
          ].map((feature, index) => (
            <div 
              key={feature.title}
              className="block-card p-6 text-center space-y-4 animate-fade-up"
              style={{ animationDelay: `${(index + 1) * 100}ms` }}
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="container max-w-4xl mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
        <p>© 2024 FlowLog. 思考がほどける日記アプリ。</p>
      </footer>
    </div>
  );
};

export default Index;
