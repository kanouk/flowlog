import logoImage from '@/assets/logo.png';

interface AppSplashProps {
  fullScreenClassName?: string;
}

export function AppSplash({
  fullScreenClassName = 'min-h-screen flow-gradient',
}: AppSplashProps) {
  return (
    <div className={`${fullScreenClassName} relative flex items-center justify-center overflow-hidden`}>
      <div className="absolute inset-0 opacity-60">
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl animate-pulse-soft" />
        <div
          className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50 dark:bg-white/5 blur-2xl"
          style={{ animation: 'pulse-soft 1.8s ease-in-out infinite' }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-4">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/50 bg-card/80 shadow-xl backdrop-blur-xl">
          <div className="absolute inset-0 rounded-3xl ring-1 ring-primary/20 animate-pulse-soft" />
          <img src={logoImage} alt="FlowLog" className="relative h-10 w-10" />
        </div>
      </div>
    </div>
  );
}
