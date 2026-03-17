import { Link2 } from 'lucide-react';
import { RaindropIntegrationSection } from './RaindropIntegrationSection';

export function ExternalIntegrationsSection() {
  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        外部連携
      </h2>
      <RaindropIntegrationSection />
    </section>
  );
}
