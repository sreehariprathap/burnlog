'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, ShieldCheck, FlaskConical, Compass } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AdminUserDetailDrawer } from './_components/AdminUserDetailDrawer';

interface AdminUserRow {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isTestAccount: boolean;
  enabledApps: string[];
  currentStreak: number;
  level: number;
  createdAt: string;
  hasSeenAppTour: boolean;
}

async function fetchUsers(): Promise<AdminUserRow[]> {
  const res = await apiFetch('/api/adminlog/users');
  if (!res.ok) throw new Error('Failed to load users');
  const data = await res.json();
  return data.users ?? [];
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export default function AdminUsersPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const { data: users, isLoading, error, mutate } = useSWR(profile?.isAdmin ? 'adminlog-users' : null, fetchUsers);
  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.firstName} ${u.lastName} ${u.username}`.toLowerCase().includes(q)
    );
  }, [users, query]);

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Everyone with a profile in this app{users ? ` — ${users.length} total` : ''}.
      </p>

      <Input
        aria-label="Search by name or username"
        placeholder="Search by name or username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <p className="text-sm text-destructive">Failed to load users.</p>}

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card
              key={u.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedUserId(u.id)}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedUserId(u.id)}
              className="cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Avatar>
                  <AvatarImage src={u.avatarUrl ?? undefined} alt={u.username} />
                  <AvatarFallback>{initials(u.firstName, u.lastName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium truncate">{u.firstName} {u.lastName}</p>
                    {u.isAdmin && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> Admin
                      </Badge>
                    )}
                    {u.isTestAccount && (
                      <Badge variant="outline" className="gap-1">
                        <FlaskConical className="h-3 w-3" /> Test
                      </Badge>
                    )}
                    {!u.hasSeenAppTour && (
                      <Badge variant="outline" className="gap-1">
                        <Compass className="h-3 w-3" /> Tour pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    @{u.username} · joined {new Date(u.createdAt).toLocaleDateString()} · {u.enabledApps.length} apps enabled
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>Lvl {u.level}</p>
                  <p>{u.currentStreak}🔥</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No users found.</p>
          )}
        </div>
      )}

      <AdminUserDetailDrawer
        userId={selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
        onSaved={() => mutate()}
      />
    </div>
  );
}
