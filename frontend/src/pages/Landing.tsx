import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sun, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/SolarSense_Logo.png';

export default function Landing() {
  return (
    <div className="app-screen relative overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-info/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-6 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="SolarSense Logo" className="h-11 w-11 object-contain" />
            <span className="text-xl font-bold tracking-tight">SolarSense</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign In</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Get Started</Link>
            </Button>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2 md:py-14">
          <section className="space-y-6">
            <p className="inline-flex rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
              AI-powered solar monitoring platform
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Detect panel issues faster and protect your energy output
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              SolarSense combines RGB inspections, anomaly detection, and mission tracking in one place so your team can act before small faults become expensive failures.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/signup">
                  Start Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">I already have an account</Link>
              </Button>
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Sun className="h-4 w-4 text-accent" />
                Real-time visibility
              </div>
              <p className="text-sm text-muted-foreground">
                Track panel health and site performance from a single dashboard.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-info" />
                Faster inspections
              </div>
              <p className="text-sm text-muted-foreground">
                Upload RGB captures and let AI highlight anomalies in seconds.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-success" />
                Operator-friendly workflows
              </div>
              <p className="text-sm text-muted-foreground">
                Coordinate missions, verify defects, and keep your maintenance process consistent.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
