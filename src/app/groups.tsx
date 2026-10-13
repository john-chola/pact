import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BackButton, Button, Chip, Input, Row, Screen, SectionLabel, showMessage } from '@/components/ui';
import { localDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { Group } from '@/lib/types';

const CATEGORIES = ['coding', 'side project', 'learning', 'exam prep', 'fitness', 'habits'];

function openFeed(group: Group) {
  router.replace({ pathname: '/feed/[groupId]', params: { groupId: group.id } });
}

export default function GroupsScreen() {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [goalCategory, setGoalCategory] = useState('coding');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!groupName.trim()) {
      showMessage('Give your group a name');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('create_group', {
      p_name: groupName.trim(),
      p_goal_category: goalCategory,
      p_start_date: localDate(),
    });
    setLoading(false);

    if (error || !data) {
      showMessage('Could not create group', error?.message);
      return;
    }
    openFeed(data as Group);
  }

  async function handleJoin() {
    const code = joinCode.toUpperCase().trim();
    if (code.length !== 6) {
      showMessage('Codes are 6 characters long');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code });
    setLoading(false);

    if (error || !data) {
      showMessage('Could not join', error?.message ?? 'Group not found. Check the code and try again.');
      return;
    }
    openFeed(data as Group);
  }

  if (mode === 'choose') {
    return (
      <Screen centered>
        <ThemedText type="subtitle" style={styles.center}>
          Join a Pact 🤝
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          A pact is up to 5 people doing a 7-day sprint together — one honest check-in a day.
        </ThemedText>
        <Button title="Create a Group" onPress={() => setMode('create')} />
        <Button title="Join with a Code" variant="outline" onPress={() => setMode('join')} />
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (mode === 'create') {
    return (
      <Screen>
        <BackButton onPress={() => setMode('choose')} />
        <ThemedText type="subtitle">Create a Group</ThemedText>

        <Input
          label="Group name"
          placeholder="e.g. Lusaka Builders"
          value={groupName}
          onChangeText={setGroupName}
          maxLength={40}
        />

        <SectionLabel>Goal category</SectionLabel>
        <Row>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              selected={goalCategory === cat}
              onPress={() => setGoalCategory(cat)}
            />
          ))}
        </Row>

        <ThemedText type="small" themeColor="textSecondary">
          Your 7-day sprint starts today. You'll get a code to share with up to 4 friends.
        </ThemedText>

        <Button title="Create Group" onPress={handleCreate} loading={loading} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton onPress={() => setMode('choose')} />
      <ThemedText type="subtitle">Join a Group</ThemedText>

      <Input
        label="Invite code"
        placeholder="6-character code"
        value={joinCode}
        onChangeText={setJoinCode}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        onSubmitEditing={handleJoin}
      />

      <Button title="Join Group" onPress={handleJoin} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
