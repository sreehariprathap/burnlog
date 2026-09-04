'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, ShieldCheck, FlaskConical } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

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
  const { data: users, isLoading, error } = useSWR(profile?.isAdmin ? 'adminlog-users' : null, fetchUsers);
  const [query, setQuery] = useState('');

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
            <Card key={u.id}>
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
    </div>
  );
}
