import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function IndexScreen() {
  const [isSignup, setIsSignup] = useState(true);
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check for existing session on app open
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/home');
      }
    });
  
    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/home');
      }
    });
  
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);
  
  async function handleAuth() {
    setLoading(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        await supabase
          .from('profiles')
          .update({ name, what_im_building: building })
          .eq('id', data.user.id);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    router.replace('/home');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.form}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ThemedText type="title" style={styles.center}>
            Pact 🚀
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {isSignup ? 'Build together. Show up daily.' : 'Welcome back'}
          </ThemedText>

          {isSignup && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder="What are you building?"
                placeholderTextColor="#666"
                value={building}
                onChangeText={setBuilding}
              />
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable style={styles.button} onPress={handleAuth} disabled={loading}>
            <ThemedText style={styles.buttonText}>
              {loading ? 'Loading...' : isSignup ? 'Create Account' : 'Log In'}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => setIsSignup(!isSignup)}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
            </ThemedText>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  form: { gap: Spacing.three },
  center: { textAlign: 'center', marginBottom: Spacing.two },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonText: { color: '#000', fontWeight: 'bold' },
});