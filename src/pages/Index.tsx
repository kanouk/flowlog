import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowRight, PenLine, Sparkles, Layers, History, CalendarDays, FileText, CheckSquare, Bookmark } from 'lucide-react';
import { AppSplash } from '@/components/common/AppSplash';
import logoImage from '@/assets/logo.png';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <AppSplash />;
  }

  const categories = [
    {
      icon: CalendarDays,
      label: '出来事',
      description: '今日あったこと',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      icon: FileText,
      label: 'メモ',
      description: 'ふと思いついたこと',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      icon: CheckSquare,
      label: 'タスク',
      description: 'やること、買い物',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      icon: Bookmark,
      label: 'あとで読む',
      description: '気になる記事をストック',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
  ];

  const features = [
    {
      icon: PenLine,
      title: 'なんでも書く',
      description: 'まずはテキストや写真をそのまま記録\n保存前にカテゴリをタップで選ぶだけ',
    },
    {
      icon: Layers,
      title: '自動で整理',
      description: '種類別に自動分類\nタスクもリーディングリストも一元管理',
    },
    {
      icon: Sparkles,
      title: 'AIが日記に',
      description: '一日の出来事を読みやすい日記に整形\n3行まとめも自動生成',
    },
    {
      icon: History,
      title: 'いつでも振り返り',
      description: 'タグで検索、日付で絞り込み\n過去の思考をすぐに見返せる',
    },
  ];

  return (
    <div className="min-h-screen flow-gradient">
      {/* Header */}
      <header className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="FlowLog" className="h-7 w-7" />
          <h1 className="text-2xl font-semibold text-gradient">FlowLog</h1>
        </div>
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
            気になったら、即メモ
          </h2>
          <p className="text-xl md:text-2xl text-gradient font-medium">
            整理はFlowLogにおまかせ
          </p>
          <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
            思いつき、タスク、メモ、気になる記事
            <br />
            頭の中のすべてを一箇所に書き留めて自動で整理
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

        {/* Categories Section */}
        <div className="mt-20 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <h3 className="text-center text-lg font-medium text-muted-foreground mb-8">
            FlowLogで書けること
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((category) => (
              <div 
                key={category.label}
                className="block-card p-4 text-center space-y-2"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${category.bgColor}`}>
                  <category.icon className={`h-5 w-5 ${category.color}`} />
                </div>
                <p className="font-medium text-foreground">{category.label}</p>
                <p className="text-xs text-muted-foreground">{category.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
          {features.map((feature, index) => (
            <div 
              key={feature.title}
              className="block-card p-6 text-center space-y-4 animate-fade-up"
              style={{ animationDelay: `${(index + 2) * 100}ms` }}
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium">{feature.title}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{feature.description}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="container max-w-4xl mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
        <p>© 2025 FlowLog — 頭の中を、クリアに</p>
      </footer>
    </div>
  );
};

export default Index;
