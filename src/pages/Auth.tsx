import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, User } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('有効なメールアドレスを入力してください');
const passwordSchema = z.string().min(6, 'パスワードは6文字以上で入力してください');

export default function Auth() {
  const navigate = useNavigate();
  const { signInWithEmail, signUpWithEmail, signInAnonymously } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [anonLoading, setAnonLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            toast.error('メールアドレスまたはパスワードが正しくありません');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('ログインしました');
      } else {
        const { error } = await signUpWithEmail(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('このメールアドレスは既に登録されています');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('アカウントを作成しました');
      }
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymous = async () => {
    setAnonLoading(true);
    try {
      const { error } = await signInAnonymously();
      if (error) {
        toast.error('匿名ログインに失敗しました');
        return;
      }
      toast.success('ログインしました');
      navigate('/dashboard');
    } finally {
      setAnonLoading(false);
    }
  };

  return (
    <div className="min-h-screen flow-gradient flex flex-col">
      {/* Header */}
      <header className="p-6">
        <h1 className="text-2xl font-semibold text-gradient">FlowLog</h1>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md space-y-8 animate-fade-up">
          {/* Hero copy */}
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground leading-tight">
              思い浮かんだ順に書いていい。
              <br />
              <span className="text-gradient">読むときは、AIが整える。</span>
            </h2>
            <p className="text-muted-foreground">
              思考がほどける日記アプリ
            </p>
          </div>

          {/* Auth form */}
          <div className="glass-card rounded-3xl p-8 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  メールアドレス
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  パスワード
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="6文字以上"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  isLogin ? 'ログイン' : 'アカウント作成'
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">または</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={handleAnonymous}
              disabled={anonLoading}
            >
              {anonLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <User className="h-4 w-4 mr-2" />
                  匿名で試す
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {isLogin ? (
                <>
                  アカウントをお持ちでない方は{' '}
                  <button
                    type="button"
                    onClick={() => setIsLogin(false)}
                    className="text-primary hover:underline font-medium"
                  >
                    新規登録
                  </button>
                </>
              ) : (
                <>
                  すでにアカウントをお持ちの方は{' '}
                  <button
                    type="button"
                    onClick={() => setIsLogin(true)}
                    className="text-primary hover:underline font-medium"
                  >
                    ログイン
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
