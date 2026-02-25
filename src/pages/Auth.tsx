import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import logoImage from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('有効なメールアドレスを入力してください');
const passwordSchema = z.string().min(6, 'パスワードは6文字以上で入力してください');

export default function Auth() {
  const navigate = useNavigate();
  const { signInWithEmail, signUpWithEmail, signInAnonymously } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen flow-gradient relative overflow-hidden">
      <header className="relative z-10 p-6 md:p-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src={logoImage} alt="FlowLog" className="h-7 w-7" />
            <h1 className="text-2xl font-semibold text-gradient">FlowLog</h1>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-96px)] items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="glass-card rounded-3xl border-border/60 p-6 sm:p-8 space-y-6 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.22)]">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.14em] uppercase text-muted-foreground">
                    Account
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-foreground">
                    {isLogin ? 'ログイン' : 'アカウント作成'}
                  </h2>
                </div>
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400/70 to-blue-500/70 p-[1px] shrink-0">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-card/90 p-2">
                    <Lock className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    !isLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  新規登録
                </button>
              </div>
            </div>

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
                    className="pl-10 h-11 bg-background/70 border-border/70"
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
                    type={showPassword ? 'text' : 'password'}
                    placeholder="6文字以上"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 bg-background/70 border-border/70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label={showPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11" 
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

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="rounded-full border border-border/60 bg-card px-3 py-1 text-[10px] tracking-[0.12em] text-muted-foreground">
                    または
                  </span>
                </div>
              </div>

            <Button
              variant="outline"
              className="w-full h-11"
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
            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400/80" />
              <span>メールログイン / 匿名ログインに対応</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
