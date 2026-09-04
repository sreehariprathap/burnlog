'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ADMIN_NAV } from '@/lib/adminlog/nav';

export default function AdminLogDashboard() {
  const { profile, loading } = useRequireAdmin();

  if (loading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      {ADMIN_NAV.map((category) => {
        const CategoryIcon = category.icon;
        return (
          <section key={category.key} id={`category-${category.key}`} className="scroll-mt-24 space-y-3">
            <div className="flex items-center gap-2">
              <CategoryIcon className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {category.label}
              </h2>
            </div>
            <div className="grid gap-3">
              {category.items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <Card className="hover:bg-muted/40 transition-colors">
                      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                        <ItemIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <CardTitle className="text-base">{item.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
