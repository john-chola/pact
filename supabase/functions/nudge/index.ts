// Pact — re-engagement nudges.
//
// Two ways to call this function:
//   1. Daily sweep (from pg_cron, see supabase/cron.sql):
//        POST { "mode": "daily" } with header `x-cron-secret: <NUDGE_CRON_SECRET>`
//      Pushes a reminder to every member of an active sprint who missed
//      yesterday's check-in.
//   2. A group mate taps "Nudge" in the app:
//        POST { "groupId": "...", "userId": "..." } with the user's JWT
//
// Deploy: supabase functions deploy nudge --no-verify-jwt
// Secrets: supabase secrets set NUDGE_CRON_SECRET=<random string>

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('NUDGE_CRON_SECRET');

const NUDGE_COOLDOWN_HOURS = 12;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

async function sendPush(messages: PushMessage[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100).map((m) => ({ ...m, sound: 'default' }))),
    });
    if (!res.ok) console.error('Expo push failed', res.status, await res.text());
  }
}

async function tokensFor(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const { data } = await admin.from('push_tokens').select('user_id, token').in('user_id', userIds);
  return new Map((data ?? []).map((row) => [row.user_id as string, row.token as string]));
}

function recentlyNudged(lastNudgedAt: string | null) {
  if (!lastNudgedAt) return false;
  return Date.now() - Date.parse(lastNudgedAt) < NUDGE_COOLDOWN_HOURS * 3_600_000;
}

async function dailySweep() {
  const today = isoDate(new Date());
  const yesterday = isoDate(new Date(Date.now() - 86_400_000));

  const { data: groups, error } = await admin
    .from('groups')
    .select('id, name, sprint_start_date, sprint_duration_days');
  if (error) throw error;

  const active = (groups ?? []).filter((g) => {
    const day = daysBetween(g.sprint_start_date, today) + 1;
    return day >= 2 && day <= g.sprint_duration_days;
  });
  if (active.length === 0) return { nudged: 0 };

  const { data: members, error: membersError } = await admin
    .from('group_members')
    .select('group_id, user_id, joined_at, last_checkin_date')
    .in('group_id', active.map((g) => g.id));
  if (membersError) throw membersError;

  const memberIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
  const { data: profiles } = memberIds.length
    ? await admin.from('profiles').select('id, last_nudged_at').in('id', memberIds)
    : { data: [] };
  const lastNudged = new Map((profiles ?? []).map((p) => [p.id as string, p.last_nudged_at as string | null]));

  const groupById = new Map(active.map((g) => [g.id, g]));
  const targets = new Map<string, { groupName: string; day: number }>();

  for (const m of members ?? []) {
    const joinedBeforeToday = isoDate(new Date(m.joined_at)) < today;
    const missedYesterday = !m.last_checkin_date || m.last_checkin_date < yesterday;
    if (!joinedBeforeToday || !missedYesterday || recentlyNudged(lastNudged.get(m.user_id) ?? null)) continue;
    if (targets.has(m.user_id)) continue;
    const g = groupById.get(m.group_id)!;
    targets.set(m.user_id, {
      groupName: g.name,
      day: daysBetween(g.sprint_start_date, today) + 1,
    });
  }

  const tokens = await tokensFor([...targets.keys()]);
  const messages: PushMessage[] = [];
  for (const [userId, t] of targets) {
    const to = tokens.get(userId);
    if (!to) continue;
    messages.push({
      to,
      title: `${t.groupName} misses you 👋`,
      body: `It's day ${t.day} of your sprint. A 10-minute check-in keeps the pact alive.`,
    });
  }

  await sendPush(messages);
  if (targets.size > 0) {
    await admin
      .from('profiles')
      .update({ last_nudged_at: new Date().toISOString() })
      .in('id', [...targets.keys()]);
  }
  return { nudged: messages.length };
}

async function nudgeMember(req: Request, groupId: string, userId: string) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(jwt);
  const caller = auth.user;
  if (!caller) return json({ error: 'Not signed in' }, 401);
  if (caller.id === userId) return json({ error: "You can't nudge yourself" }, 400);

  const { data: rows } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('user_id', [caller.id, userId]);
  if ((rows ?? []).length !== 2) return json({ error: 'You are not in this group together' }, 403);

  const [{ data: group }, { data: profiles }] = await Promise.all([
    admin.from('groups').select('name').eq('id', groupId).single(),
    admin.from('profiles').select('id, name, last_nudged_at').in('id', [caller.id, userId]),
  ]);
  const callerName = profiles?.find((p) => p.id === caller.id)?.name ?? 'A group mate';
  const target = profiles?.find((p) => p.id === userId);

  if (recentlyNudged(target?.last_nudged_at ?? null)) {
    return json({ sent: false, reason: 'Already nudged recently — give them a little time.' });
  }

  const token = (await tokensFor([userId])).get(userId);
  if (!token) {
    return json({ sent: false, reason: "They haven't turned on notifications yet." });
  }

  await sendPush([
    {
      to: token,
      title: `${callerName} nudged you 👊`,
      body: `${group?.name ?? 'Your pact'} is waiting for your check-in.`,
      data: { groupId },
    },
  ]);
  await admin.from('profiles').update({ last_nudged_at: new Date().toISOString() }).eq('id', userId);
  return json({ sent: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    if (body.mode === 'daily') {
      if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
        return json({ error: 'Forbidden' }, 403);
      }
      return json(await dailySweep());
    }

    if (typeof body.groupId === 'string' && typeof body.userId === 'string') {
      return await nudgeMember(req, body.groupId, body.userId);
    }

    return json({ error: 'Bad request' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
});
