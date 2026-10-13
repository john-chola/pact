import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  BackButton,
  Button,
  Card,
  Chip,
  confirmAction,
  Input,
  Loading,
  Row,
  Screen,
  SectionLabel,
  showMessage,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addDays, liveStreak, localDate, sprintDay, timeAgo } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { REACTION_EMOJIS, type Checkin, type Group, type Member, type Profile } from '@/lib/types';

const FEELINGS = ['😩 Struggling', '😐 Meh', '🙂 Okay', '😄 Good', '🔥 On fire'];
const DURATIONS = [15, 30, 60, 90, 120];

type MemberProfile = Pick<Profile, 'id' | 'name' | 'what_im_building'>;

export default function FeedScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id;
  const theme = useTheme();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Map<string, MemberProfile>>(new Map());
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [workedOn, setWorkedOn] = useState('');
  const [duration, setDuration] = useState('');
  const [feeling, setFeeling] = useState('');
  const [feelingNote, setFeelingNote] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [posting, setPosting] = useState(false);
  const [nudging, setNudging] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    const [groupRes, membersRes, checkinsRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
      supabase
        .from('group_members')
        .select('user_id, joined_at, streak_count, longest_streak, last_checkin_date')
        .eq('group_id', groupId)
        .order('joined_at'),
      supabase
        .from('checkins')
        .select('*, reactions(id, emoji, user_id)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (!groupRes.data) {
      showMessage('Group not found', "You may have left this group or it doesn't exist.");
      router.replace('/');
      return;
    }

    const memberRows = (membersRes.data ?? []) as Member[];
    const ids = memberRows.map((m) => m.user_id);
    const { data: profileRows } = ids.length
      ? await supabase.from('profiles').select('id, name, what_im_building').in('id', ids)
      : { data: [] };

    setGroup(groupRes.data as Group);
    setMembers(memberRows);
    setProfiles(new Map((profileRows ?? []).map((p) => [p.id, p as MemberProfile])));
    setCheckins((checkinsRes.data ?? []) as Checkin[]);
    setLoaded(true);
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Realtime: any new check-in, reaction or streak change reloads the feed.
  // Groups are at most 5 people, so a full reload is cheap and always correct.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!groupId) return;
    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 300);
    };

    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkins', filter: `group_id=eq.${groupId}` },
        scheduleReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` },
        scheduleReload
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, scheduleReload)
      .subscribe();

    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!loaded || !group || !userId) return <Loading />;

  const today = localDate();
  const yesterday = addDays(today, -1);
  const day = sprintDay(group.sprint_start_date, today);
  const sprintOver = day > group.sprint_duration_days;
  const me = members.find((m) => m.user_id === userId);
  const checkedInToday = me?.last_checkin_date === today;
  const sprintCheckins = checkins.filter((c) => c.sprint_number === group.sprint_number);
  const myDates = new Set(sprintCheckins.filter((c) => c.user_id === userId).map((c) => c.checkin_date));
  const nameOf = (id: string) => profiles.get(id)?.name || 'Someone';

  async function handleSubmit() {
    if (!workedOn.trim()) {
      showMessage('What did you work on?', 'Even 10 minutes counts — tell your group.');
      return;
    }
    setPosting(true);
    const honestFeeling = [feeling, feelingNote.trim()].filter(Boolean).join(' — ');
    const { error } = await supabase.from('checkins').insert({
      group_id: groupId,
      user_id: userId,
      worked_on: workedOn.trim(),
      duration_minutes: parseInt(duration, 10) || 0,
      honest_feeling: honestFeeling || null,
      tomorrow_plan: tomorrowPlan.trim() || null,
      checkin_date: today,
    });
    setPosting(false);

    if (error) {
      showMessage('Could not post check-in', error.message);
      return;
    }

    setWorkedOn('');
    setDuration('');
    setFeeling('');
    setFeelingNote('');
    setTomorrowPlan('');
    setShowForm(false);
    await Promise.all([load(), refreshProfile()]);

    // Checked in on every day of the sprint → celebrate.
    if (group && myDates.size + 1 >= group.sprint_duration_days) {
      router.push({ pathname: '/sprint-complete/[groupId]', params: { groupId: group.id } });
    }
  }

  async function toggleReaction(checkin: Checkin, emoji: string) {
    const mine = checkin.reactions?.find((r) => r.emoji === emoji && r.user_id === userId);
    // Optimistic update; realtime reload reconciles.
    setCheckins((prev) =>
      prev.map((c) =>
        c.id !== checkin.id
          ? c
          : {
              ...c,
              reactions: mine
                ? (c.reactions ?? []).filter((r) => r.id !== mine.id)
                : [...(c.reactions ?? []), { id: `tmp-${emoji}`, emoji, user_id: userId! }],
            }
      )
    );
    const { error } = mine
      ? await supabase.from('reactions').delete().eq('id', mine.id)
      : await supabase.from('reactions').insert({ checkin_id: checkin.id, user_id: userId, emoji });
    if (error) load();
  }

  async function nudge(member: Member) {
    setNudging(member.user_id);
    const { data, error } = await supabase.functions.invoke('nudge', {
      body: { groupId, userId: member.user_id },
    });
    setNudging(null);
    if (error) {
      showMessage('Could not send nudge', 'Make sure the nudge function is deployed.');
    } else if (data?.sent) {
      showMessage('Nudge sent 👊', `${nameOf(member.user_id)} will get a notification.`);
    } else {
      showMessage('Nudge not sent', data?.reason ?? data?.error);
    }
  }

  async function invite() {
    await Share.share({
      message: `Join my pact "${group!.name}" on Pact — we're doing a ${group!.sprint_duration_days}-day sprint together. Code: ${group!.join_code}`,
    });
  }

  function leave() {
    confirmAction(
      'Leave this pact?',
      'Your check-ins stay in the feed, but you will stop seeing the group.',
      'Leave',
      async () => {
        const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
        if (error) showMessage('Could not leave group', error.message);
        else router.replace('/');
      }
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Row style={styles.spread}>
        <BackButton label="Home" onPress={() => router.replace('/')} />
        <Pressable onPress={invite} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            Invite · {group.join_code}
          </ThemedText>
        </Pressable>
      </Row>

      <View>
        <ThemedText type="subtitle" style={styles.title}>
          {group.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {group.goal_category} · Sprint {group.sprint_number} · {members.length}/{group.max_members} members
        </ThemedText>
      </View>

      {/* Sprint progress */}
      <Card>
        <Row style={styles.spread}>
          <ThemedText type="smallBold">
            {sprintOver ? 'Sprint complete 🎉' : `Day ${day} of ${group.sprint_duration_days}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            🔥 {liveStreak(me?.streak_count ?? 0, me?.last_checkin_date ?? null, today)} day streak
          </ThemedText>
        </Row>
        <Row style={styles.dots}>
          {Array.from({ length: group.sprint_duration_days }, (_, i) => {
            const date = addDays(group.sprint_start_date, i);
            const done = myDates.has(date);
            const isToday = date === today;
            return (
              <View
                key={date}
                style={[
                  styles.dot,
                  { backgroundColor: done ? theme.tint : theme.backgroundSelected },
                  isToday && { borderColor: theme.text, borderWidth: 2 },
                ]}>
                <ThemedText type="small" style={done && { color: theme.onTint }}>
                  {i + 1}
                </ThemedText>
              </View>
            );
          })}
        </Row>
        {sprintOver && (
          <Button
            title="See sprint results"
            onPress={() =>
              router.push({ pathname: '/sprint-complete/[groupId]', params: { groupId: group.id } })
            }
          />
        )}
      </Card>

      {/* Members */}
      <SectionLabel>Crew</SectionLabel>
      <Card>
        {members.map((m) => {
          const doneToday = m.last_checkin_date === today;
          const quiet =
            !doneToday &&
            (m.last_checkin_date ? m.last_checkin_date < yesterday : m.joined_at.slice(0, 10) < today);
          const isMe = m.user_id === userId;
          return (
            <Row key={m.user_id} style={styles.memberRow}>
              <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold">{nameOf(m.user_id).charAt(0).toUpperCase()}</ThemedText>
              </View>
              <View style={styles.memberInfo}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {nameOf(m.user_id)}
                  {isMe ? ' (you)' : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  🔥 {liveStreak(m.streak_count, m.last_checkin_date, today)}
                  {profiles.get(m.user_id)?.what_im_building
                    ? ` · ${profiles.get(m.user_id)!.what_im_building}`
                    : ''}
                </ThemedText>
              </View>
              {doneToday ? (
                <ThemedText type="small" style={{ color: theme.successText }}>
                  ✅ today
                </ThemedText>
              ) : quiet && !isMe && !sprintOver ? (
                <Button
                  small
                  variant="outline"
                  title="Nudge 👊"
                  loading={nudging === m.user_id}
                  onPress={() => nudge(m)}
                />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  ⏳
                </ThemedText>
              )}
            </Row>
          );
        })}
        {members.length < group.max_members && (
          <Button small variant="ghost" title="+ Invite a friend" onPress={invite} />
        )}
      </Card>

      {/* Check-in */}
      {sprintOver ? null : checkedInToday ? (
        <Card style={{ backgroundColor: theme.successBackground }}>
          <ThemedText style={{ color: theme.successText }}>
            ✅ You checked in today. See you tomorrow!
          </ThemedText>
        </Card>
      ) : showForm ? (
        <View style={styles.form}>
          <ThemedText type="smallBold">Day {day} check-in</ThemedText>
          <Input
            label="💻 What I worked on"
            placeholder="Shipped the login screen, fixed a nasty bug…"
            value={workedOn}
            onChangeText={setWorkedOn}
            multiline
          />
          <ThemedText type="small" themeColor="textSecondary">
            ⏱ How long?
          </ThemedText>
          <Row>
            {DURATIONS.map((d) => (
              <Chip
                key={d}
                label={d < 60 ? `${d}m` : `${d / 60}h`}
                selected={duration === String(d)}
                onPress={() => setDuration(String(d))}
              />
            ))}
          </Row>
          <Input
            placeholder="or minutes, e.g. 45"
            value={DURATIONS.map(String).includes(duration) ? '' : duration}
            onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
          />
          <ThemedText type="small" themeColor="textSecondary">
            😓 Honest feeling
          </ThemedText>
          <Row>
            {FEELINGS.map((f) => (
              <Chip key={f} label={f} selected={feeling === f} onPress={() => setFeeling(feeling === f ? '' : f)} />
            ))}
          </Row>
          <Input placeholder="Anything on your mind? (optional)" value={feelingNote} onChangeText={setFeelingNote} />
          <Input
            label="🎯 Tomorrow's plan"
            placeholder="What's next?"
            value={tomorrowPlan}
            onChangeText={setTomorrowPlan}
          />
          <Button title="Post Check-in" onPress={handleSubmit} loading={posting} />
          <Button title="Cancel" variant="ghost" onPress={() => setShowForm(false)} />
        </View>
      ) : (
        <Button title={`+ Day ${day} Check-in`} onPress={() => setShowForm(true)} />
      )}

      {/* Feed */}
      <SectionLabel>Check-ins</SectionLabel>
      {checkins.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          No check-ins yet. Be the first 💪
        </ThemedText>
      ) : (
        checkins.map((c) => (
          <Card key={c.id}>
            <Row style={styles.spread}>
              <ThemedText type="smallBold">{nameOf(c.user_id)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {c.sprint_number && c.sprint_number !== group.sprint_number
                  ? `Sprint ${c.sprint_number} · `
                  : ''}
                {timeAgo(c.created_at)}
              </ThemedText>
            </Row>
            <ThemedText type="small">💻 {c.worked_on}</ThemedText>
            {c.duration_minutes > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                ⏱ {c.duration_minutes} min
              </ThemedText>
            )}
            {c.honest_feeling ? <ThemedText type="small">{c.honest_feeling}</ThemedText> : null}
            {c.tomorrow_plan ? (
              <ThemedText type="small" themeColor="textSecondary">
                🎯 {c.tomorrow_plan}
              </ThemedText>
            ) : null}
            <Row style={styles.reactions}>
              {REACTION_EMOJIS.map((emoji) => {
                const list = (c.reactions ?? []).filter((r) => r.emoji === emoji);
                const mine = list.some((r) => r.user_id === userId);
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`React ${emoji}`}
                    onPress={() => toggleReaction(c, emoji)}
                    style={[
                      styles.reaction,
                      { borderColor: mine ? theme.tint : theme.border },
                      mine && { backgroundColor: theme.successBackground },
                    ]}>
                    <ThemedText type="small">
                      {emoji}
                      {list.length ? ` ${list.length}` : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </Row>
          </Card>
        ))
      )}

      <Button title="Leave group" variant="ghost" onPress={leave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { justifyContent: 'space-between', flexWrap: 'nowrap' },
  title: { fontSize: 28, lineHeight: 36 },
  center: { textAlign: 'center' },
  form: { gap: Spacing.two },
  dots: { gap: 6, flexWrap: 'nowrap' },
  dot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRow: { flexWrap: 'nowrap', paddingVertical: Spacing.one },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  reactions: { marginTop: Spacing.one, gap: 6 },
  reaction: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
});
