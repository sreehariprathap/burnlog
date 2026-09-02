'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type InviteRow = { id: string; email: string; status: string; createdAt: string; signedUpAt: string | null };

export default function InvitesPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const supabase = createClient();

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('adminlog_invites')
      .select('id, email, status, createdAt, signedUpAt')
      .order('createdAt', { ascending: false });
    setInvites((data ?? []) as InviteRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (profile?.isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin]);

  async function handleInvite() {
    if (!email.trim()) return;
    const { error } = await supabase
      .from('adminlog_invites')
      .insert([{ email: email.trim(), invitedByAdminId: profile!.id }]);
    if (!error) {
      setEmail('');
      await load();
    }
  }

  const signupUrl = typeof window !== 'undefined' ? `${window.location.origin}/signup` : '/signup';

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Invites</h1>

      <Card>
        <CardHeader><CardTitle>Send an invite</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="email address" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <div className="flex gap-2">
            <Button onClick={handleInvite}>Track invite</Button>
            <Button variant="outline" asChild>
              <a href={`mailto:${email}?subject=${encodeURIComponent("You're invited")}&body=${encodeURIComponent(`Sign up here: ${signupUrl}`)}`}>
                <Mail className="h-4 w-4 mr-1" /> Open email
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Signup stays open to everyone — this just tracks who you've reached out to.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <Loader2 className="animate-spin h-6 w-6 mx-auto" />
      ) : (
        <div className="space-y-2">
          {invites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between text-sm border-b py-2">
              <span>{invite.email}</span>
              <span className={invite.status === 'signed_up' ? 'text-success' : 'text-muted-foreground'}>
                {invite.status === 'signed_up' ? `Signed up ${new Date(invite.signedUpAt!).toLocaleDateString()}` : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
