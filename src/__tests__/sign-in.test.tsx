import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SignInScreen from '@/app/sign-in';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
    },
  },
}));

const auth = supabase.auth as jest.Mocked<typeof supabase.auth>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('asks for credentials before calling Supabase', async () => {
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByText('Create Account'));
  expect(Alert.alert).toHaveBeenCalledWith('Enter your email and password', undefined);
  expect(auth.signUp).not.toHaveBeenCalled();
});

it('rejects short passwords on sign up', async () => {
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'ada@example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), '123');
  await fireEvent.press(screen.getByText('Create Account'));
  expect(Alert.alert).toHaveBeenCalledWith('Password too short', 'Use at least 6 characters.');
  expect(auth.signUp).not.toHaveBeenCalled();
});

it('tells the user to confirm their email when Supabase returns no session', async () => {
  auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null } as any);
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), '  ada@example.com ');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret123');
  await fireEvent.press(screen.getByText('Create Account'));

  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith(
      'Check your email',
      'Confirm your address, then come back and log in.'
    )
  );
  expect(auth.signUp).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret123' });
  expect(screen.getByText('Log In')).toBeOnTheScreen();
});

it('logs in with the trimmed email', async () => {
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null } as any);
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByText('Already have an account? Log in'));
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'ada@example.com ');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret123');
  await fireEvent.press(screen.getByText('Log In'));
  await waitFor(() =>
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret123',
    })
  );
});
