import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppSplash } from "@/components/common/AppSplash";
import Index from "./pages/Index";
import Auth from "./pages/StagingAuth";
import NotFound from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const OAuthAuthorize = lazy(() => import("./pages/OAuthAuthorize"));
const Analytics = lazy(() => import("./pages/Analytics"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      {import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT !== 'production' && <div className="border-b bg-amber-50 px-3 py-2 text-center text-xs text-amber-950">
        {import.meta.env.VITE_MIGRATION_READ_ONLY ? <>移行前の検証用コピーです。記録・編集と自動生成は停止しています。今後は <a className="underline" href="https://flowlog.jp">flowlog.jp</a> を使ってください。</> : <>検証用コピーです。本番へは反映されません。日記の自動生成は新しく追加する出来事だけが対象です。過去の日記は保護し、外部サービスへの書き込みは停止中です。</>}
      </div>}
      <BrowserRouter>
        <Suspense fallback={<AppSplash />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/oauth/authorize" element={<OAuthAuthorize />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
