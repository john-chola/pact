import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function GroupsScreen() {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [goalCategory, setGoalCategory] = useState('coding');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setLoading(false);
      return;
    }

    const code = generateCode();

    const { data: group, error } = await supabase
      .from('groups')
      .insert({
        name: groupName,
        goal_category: goalCategory,
        created_by: userId,
        join_code: code,
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: userId,
    });

    setLoading(false);
    router.replace(`/feed?groupId=${group.id}`);
  }

  async function handleJoin() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setLoading(false);
      return;
    }

    const { data: group, error } = await supabase
      .from('groups')
      .select()
      .eq('join_code', joinCode.toUpperCase().trim())
      .single();

    if (error || !group) {
      alert('Group not found. Check the code and try again.');
      setLoading(false);
      return;
    }

    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: userId,
    });

    setLoading(false);
    router.replace(`/feed?groupId=${group.id}`);
  }

  if (mode === 'choose') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.center}>
            Join a Pact 🤝
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Create a new group or join one with a code
          </ThemedText>

          <Pressable style={styles.button} onPress={() => setMode('create')}>
            <ThemedText style={styles.buttonText}>Create a Group</ThemedText>
          </Pressable>

          <Pressable style={styles.buttonOutline} onPress={() => setMode('join')}>
            <ThemedText>Join with a Code</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (mode === 'create') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.center}>
            Create a Group
          </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Group name (e.g. Pact - Build Season)"
            placeholderTextColor="#666"
            value={groupName}
            onChangeText={setGroupName}
          />

          <ThemedText type="small" themeColor="textSecondary">
            Goal category
          </ThemedText>
          <ThemedView style={styles.row}>
            {['coding', 'exam prep', 'fitness', 'habits'].map((cat) => (
              <Pressable
                key={cat}
                style={[styles.chip, goalCategory === cat && styles.chipActive]}
                onPress={() => setGoalCategory(cat)}>
                <ThemedText style={styles.chipText}>{cat}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <Pressable style={styles.button} onPress={handleCreate} disabled={loading}>
            <ThemedText style={styles.buttonText}>
              {loading ? 'Creating...' : 'Create Group'}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => setMode('choose')}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Back
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.center}>
          Join a Group
        </ThemedText>

        <TextInput
          style={styles.input}
          placeholder="Enter 6-character code"
          placeholderTextColor="#666"
          value={joinCode}
          onChangeText={setJoinCode}
          autoCapitalize="characters"
          maxLength={6}
        />

        <Pressable style={styles.button} onPress={handleJoin} disabled={loading}>
          <ThemedText style={styles.buttonText}>
            {loading ? 'Joining...' : 'Join Group'}
          </ThemedText>
        </Pressable>

        <Pressable onPress={() => setMode('choose')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Back
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.three },
  center: { textAlign: 'center' },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  chipActive: { backgroundColor: '#22c55e' },
  chipText: { fontSize: 13 },
  button: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.two,
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