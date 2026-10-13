import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Row, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { liveStreak, localDate, sprintDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { Group, Member } from '@/lib/types';

type HomeGroup = Group & { me: Member; memberCount: number };

export default function HomeScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const theme = useTheme();
  const [groups, setGroups] = useState<HomeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('group_members')
      .select('user_id, joined_at, streak_count, longest_streak, last_checkin_date, groups(*)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });

    const rows = (data ?? []).filter((row: any) => row.groups);
    const ids = rows.map((row: any) => row.groups.id as string);

    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: all } = await supabase.from('group_members').select('group_id').in('group_id', ids);
      for (const m of all ?? []) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
    }

    setGroups(
      rows.map((row: any) => {
        const { groups: group, ...me } = row;
        return { ...(group as Group), me: me as Member, memberCount: counts.get(group.id) ?? 1 };
      })
    );
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshProfile();
    }, [load, refreshProfile])
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), refreshProfile()]);
    setRefreshing(false);
  }

  if (loading) return <Loading />;

  const today = localDate();
  const streak = liveStreak(profile?.streak_count ?? 0, profile?.last_checkin_date ?? null, today);
  const checkedInToday = profile?.last_checkin_date === today;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Row style={styles.header}>
        <ThemedText type="subtitle">Pact 🚀</ThemedText>
        <Row style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Reminders"
            hitSlop={8}
            onPress={() => router.push('/notifications')}>
            <ThemedText>🔔</ThemedText>
          </Pressable>
          <Pressable hitSlop={8} onPress={signOut}>
            <ThemedText type="small" themeColor="textSecondary">
              Log out
            </ThemedText>
          </Pressable>
        </Row>
      </Row>

      <ThemedText themeColor="textSecondary">
        Hey {profile?.name?.split(' ')[0]} 👋
        {profile?.what_im_building ? ` How's ${profile.what_im_building} going?` : ''}
      </ThemedText>

      <Card style={styles.streakCard}>
        <View>
          <ThemedText style={styles.streakNumber}>🔥 {streak}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            day streak · best {profile?.longest_streak ?? 0}
          </ThemedText>
        </View>
        <ThemedText type="small" style={{ color: checkedInToday ? theme.successText : theme.warning }}>
          {checkedInToday ? 'Checked in today ✅' : streak > 0 ? 'Check in to keep it alive' : 'Start a streak today'}
        </ThemedText>
      </Card>

      {groups.length === 0 ? (
        <Card style={styles.empty}>
          <ThemedText type="default" style={styles.center}>
            You're not in a pact yet
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Start a 7-day sprint with up to 4 friends, or join one with a code.
          </ThemedText>
          <Button title="Create or join a pact" onPress={() => router.push('/groups')} />
        </Card>
      ) : (
        <>
          <SectionLabel>Your pacts</SectionLabel>
          {groups.map((group) => {
            const day = sprintDay(group.sprint_start_date, today);
            const over = day > group.sprint_duration_days;
            const doneToday = group.me.last_checkin_date === today;
            return (
              <Pressable
                key={group.id}
                onPress={() =>
                  router.push({ pathname: '/feed/[groupId]', params: { groupId: group.id } })
                }>
                <Card>
                  <Row style={styles.spread}>
                    <ThemedText style={styles.groupName}>{group.name}</ThemedText>
                    <ThemedText>→</ThemedText>
                  </Row>
                  <ThemedText type="small" themeColor="textSecondary">
                    {group.goal_category} · {group.memberCount}/{group.max_members} members ·{' '}
                    {over
                      ? `Sprint ${group.sprint_number} complete 🎉`
                      : `Day ${day} of ${group.sprint_duration_days}`}
                  </ThemedText>
                  {!over && (
                    <ThemedText
                      type="small"
                      style={{ color: doneToday ? theme.successText : theme.warning }}>
                      {doneToday ? '✅ Checked in today' : '⏳ Waiting on your check-in'}
                    </ThemedText>
                  )}
                </Card>
              </Pressable>
            );
          })}
          <Button
            title="+ Create or join another pact"
            variant="outline"
            onPress={() => router.push('/groups')}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { justifyContent: 'space-between' },
  headerActions: { gap: Spacing.three },
  center: { textAlign: 'center' },
  spread: { justifyContent: 'space-between', flexWrap: 'nowrap' },
  streakCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakNumber: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  empty: { alignItems: 'stretch', gap: Spacing.three, paddingVertical: Spacing.four },
  groupName: { fontWeight: 700, fontSize: 17, flexShrink: 1 },
});
