import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

interface CreateActivityPostInput {
  profileId: string;
  sourceApp: string;
  sourceRefType: string;
  sourceRefId: string;
  body: string;
}

/** Inserts a CROSS_APP_ACTIVITY post unless the profile has opted out via showCrossAppActivity. */
export async function createActivityPost({
  profileId,
  sourceApp,
  sourceRefType,
  sourceRefId,
  body,
}: CreateActivityPostInput): Promise<void> {
  const admin = createServiceRoleClient();

  const { data: settings } = await admin
    .from('social_profile_settings')
    .select('showCrossAppActivity')
    .eq('profileId', profileId)
    .maybeSingle();

  if (settings && settings.showCrossAppActivity === false) return;

  await admin.from('social_posts').insert({
    profileId,
    kind: 'CROSS_APP_ACTIVITY',
    body,
    sourceApp,
    sourceRefType,
    sourceRefId,
  });
}
