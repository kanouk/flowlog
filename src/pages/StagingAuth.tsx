import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { resetStagingPassword } from '@/integrations/cloudflare/client';
import logoImage from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

export default function StagingAuth() {
  const navigate = useNavigate();
  const { signInWithEmail } = useAuth();
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('reset') || '');
  useEffect(() => { if (resetToken) history.replaceState(null, '', window.location.pathname); }, [resetToken]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleReady,setGoogleReady]=useState(false);
  useEffect(()=>{void fetch('/api/auth-options').then(r=>r.json()).then(r=>setGoogleReady(r.google===true)).catch(()=>{});},[]);
  const destination=()=>{
    try {const target=new URL(new URLSearchParams(window.location.search).get('redirect')||'/dashboard',window.location.origin);return target.origin===window.location.origin?target.pathname+target.search:'/dashboard';}
    catch{return '/dashboard';}
  };
  const googleLogin=async()=>{
    setLoading(true);
    try {
      const response=await fetch('/api/auth/sign-in/social',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:window.location.origin+destination(),errorCallbackURL:window.location.origin+'/auth',disableRedirect:true})});
      const data=await response.json();
      if(!response.ok||!data.url)throw new Error('Googleログインを開始できませんでした');
      window.location.assign(data.url);
    }catch{toast.error('Googleログインを開始できませんでした');setLoading(false);}
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetToken && !z.string().email().safeParse(email).success) { toast.error('有効なメールアドレスを入力してください'); return; }
    if (password.length < 12) { toast.error('パスワードは12文字以上で入力してください'); return; }
    setLoading(true);
    try {
      const { error } = resetToken ? await resetStagingPassword(resetToken, password) : await signInWithEmail(email, password);
      if (error) { toast.error(error.message); return; }
      if (resetToken) { setResetToken(''); setPassword(''); toast.success('パスワードを設定しました。ログインしてください。'); }
      else navigate(destination());
    } finally { setLoading(false); }
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
            <img src={logoImage} alt="FlowLog" decoding="async" className="h-7 w-7" />
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
                    {resetToken ? '初回パスワード再設定' : 'ログイン'}
                  </h2>
                </div>
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400/70 to-blue-500/70 p-[1px] shrink-0">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-card/90 p-2">
                    <Lock className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                  </div>
                </div>
              </div>

            </div>

            {!resetToken && <div className="space-y-2">
              <Button type="button" variant="outline" className="w-full" disabled={loading||!googleReady} onClick={googleLogin}>
                Googleでログイン
              </Button>
              {!googleReady && <p className="text-center text-xs text-muted-foreground">Googleログインは接続設定待ちです。</p>}
            </div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!resetToken && <div className="space-y-2">
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
              </div>}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {resetToken ? '新しいパスワード（12文字以上）' : 'パスワード'}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="12文字以上"
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
                  resetToken ? 'パスワードを設定' : 'ログイン'
                )}
              </Button>
            </form>

            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400/80" />
              <span>本人アカウント専用</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
