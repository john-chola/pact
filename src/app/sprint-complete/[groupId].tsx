import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Row, Screen, SectionLabel, showMessage } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { localDate, sprintDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { Group } from '@/lib/types';

type MemberStats = { userId: string; name: string; days: number; minutes: number };

export default function SprintCompleteScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const theme = useTheme();
  const userId = session?.user.id;

  const [group, setGroup] = useState<Group | null>(null);
  const [stats, setStats] = useState<MemberStats[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
      if (!g) {
        router.replace('/');
        return;
      }
      const [{ data: members }, { data: checkins }] = await Promise.all([
        supabase.from('group_members').select('user_id').eq('group_id', groupId),
        supabase
          .from('checkins')
          .select('user_id, checkin_date, duration_minutes')
          .eq('group_id', groupId)
          .eq('sprint_number', g.sprint_number),
      ]);
      const ids = (members ?? []).map((m) => m.user_id as string);
      const { data: profiles } = ids.length
        ? await supabase.from('profiles').select('id, name').in('id', ids)
        : { data: [] };

      setGroup(g as Group);
      setStats(
        ids
          .map((id) => {
            const mine = (checkins ?? []).filter((c) => c.user_id === id);
            return {
              userId: id,
              name: profiles?.find((p) => p.id === id)?.name || 'Someone',
              days: new Set(mine.map((c) => c.checkin_date)).size,
              minutes: mine.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0),
            };
          })
          .sort((a, b) => b.days - a.days || b.minutes - a.minutes)
      );
    })();
  }, [groupId]);

  if (!group || !userId) return <Loading />;

  const duration = group.sprint_duration_days;
  const sprintOver = sprintDay(group.sprint_start_date) > duration;
  const me = stats.find((s) => s.userId === userId);
  const groupDays = stats.reduce((sum, s) => sum + s.days, 0);
  const groupMinutes = stats.reduce((sum, s) => sum + s.minutes, 0);
  const perfect = stats.length > 0 && stats.every((s) => s.days >= duration);
  const iFinished = (me?.days ?? 0) >= duration;

  const headline = perfect
    ? 'Perfect pact! 🏆'
    : iFinished
      ? `You showed up all ${duration} days! 🎉`
      : sprintOver
        ? `Sprint ${group.sprint_number} is done 🎉`
        : `Sprint ${group.sprint_number} so far`;

  async function startNextSprint() {
    setStarting(true);
    const { error } = await supabase.rpc('start_new_sprint', {
      p_group_id: groupId,
      p_start_date: localDate(),
    });
    setStarting(false);
    if (error) {
      showMessage('Could not start a new sprint', error.message);
      return;
    }
    router.replace({ pathname: '/feed/[groupId]', params: { groupId: group!.id } });
  }

  return (
    <Screen>
      <Animated.View entering={ZoomIn.springify()} style={styles.hero}>
        <ThemedText style={styles.trophy}>{perfect || iFinished ? '🏆' : '🎉'}</ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150)} style={styles.headline}>
        <ThemedText type="subtitle" style={styles.center}>
          {headline}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {group.name} · Sprint {group.sprint_number}
        </ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300)}>
        <Row style={styles.statsRow}>
          <Card style={styles.stat}>
            <ThemedText style={styles.statNumber}>
              {me?.days ?? 0}/{duration}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              your days
            </ThemedText>
          </Card>
          <Card style={styles.stat}>
            <ThemedText style={styles.statNumber}>{Math.round((me?.minutes ?? 0) / 6) / 10}h</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              you built
            </ThemedText>
          </Card>
          <Card style={styles.stat}>
            <ThemedText style={styles.statNumber}>{Math.round(groupMinutes / 6) / 10}h</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              crew total
            </ThemedText>
          </Card>
        </Row>
      </Animated.View>

      <SectionLabel>The crew · {groupDays} check-ins</SectionLabel>
      <Card>
        {stats.map((s) => (
          <View key={s.userId} style={styles.memberRow}>
            <Row style={styles.spread}>
              <ThemedText type="smallBold">
                {s.name}
                {s.userId === userId ? ' (you)' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {s.days}/{duration} days · {s.minutes} min
              </ThemedText>
            </Row>
            <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
              <View
                style={[
                  styles.barFill,
                  { backgroundColor: theme.tint, width: `${Math.min(100, (s.days / duration) * 100)}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </Card>

      {sprintOver ? (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Keep the momentum — same crew, fresh {duration} days.
          </ThemedText>
          <Button
            title={`Start sprint ${group.sprint_number + 1}`}
            onPress={startNextSprint}
            loading={starting}
          />
        </>
      ) : null}
      <Button
        title="Back to feed"
        variant="outline"
        onPress={() => router.replace({ pathname: '/feed/[groupId]', params: { groupId: group.id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: Spacing.four },
  trophy: { fontSize: 88, lineHeight: 104 },
  headline: { gap: Spacing.one },
  center: { textAlign: 'center' },
  statsRow: { flexWrap: 'nowrap' },
  stat: { flex: 1, alignItems: 'center', gap: 0 },
  statNumber: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
  spread: { justifyContent: 'space-between', flexWrap: 'nowrap' },
  memberRow: { gap: Spacing.one, paddingVertical: Spacing.one },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});
