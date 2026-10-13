import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Group = {
  id: string;
  name: string;
  goal_category: string;
  join_code: string;
};

export default function HomeScreen() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserGroups();
  }, []);

  async function loadUserGroups() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      router.replace('/');
      return;
    }

    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, goal_category, join_code)')
      .eq('user_id', userId);

    if (!error && data) {
      const userGroups = data
       .map((row: any) => row.groups)
       .filter(Boolean)
       .filter(
         (group: Group, index: number, self: Group[]) =>
           index === self.findIndex((g) => g.id === group.id)
        );
    setGroups(userGroups);
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color="#22c55e" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>

        <ThemedView style={styles.header}>
          <ThemedText type="title">Pact 🚀</ThemedText>
          <Pressable onPress={() => router.push('/notifications')}>
            <ThemedText type="small" themeColor="textSecondary">🔔</ThemedText>
          </Pressable>
          <Pressable onPress={handleLogout}>
            <ThemedText type="small" themeColor="textSecondary">
              Log out
            </ThemedText>
          </Pressable>
        </ThemedView>

        {groups.length === 0 ? (
          <ThemedView style={styles.empty}>
            <ThemedText type="subtitle" style={styles.center}>
              No groups yet
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Create or join a group to get started
            </ThemedText>
            <Pressable
              style={styles.button}
              onPress={() => router.push('/groups')}>
              <ThemedText style={styles.buttonText}>
                Join a Pact
              </ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <ThemedView style={styles.groupList}>
            <ThemedText type="small" themeColor="textSecondary">
              YOUR GROUPS
            </ThemedText>

            {groups.map((group) => (
              <Pressable
                key={group.id}
                style={styles.groupCard}
                onPress={() => router.push(`/feed?groupId=${group.id}`)}>
                <ThemedView>
                  <ThemedText style={styles.groupName}>
                    {group.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {group.goal_category} · Code: {group.join_code}
                  </ThemedText>
                </ThemedView>
                <ThemedText>→</ThemedText>
              </Pressable>
            ))}

            <Pressable
              style={styles.buttonOutline}
              onPress={() => router.push('/groups')}>
              <ThemedText>+ Join Another Group</ThemedText>
            </Pressable>
          </ThemedView>
        )}

      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  center: { textAlign: 'center' },
  groupList: { gap: Spacing.three },
  groupCard: {
    backgroundColor: '#1a1a1a',
    padding: Spacing.three,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupName: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  button: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#000', fontWeight: 'bold' },
});