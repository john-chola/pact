import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, Chip } from '@/components/ui';

describe('Button', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button title="Post Check-in" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Post Check-in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides the label and ignores taps while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Post Check-in" onPress={onPress} loading />);
    expect(screen.queryByText('Post Check-in')).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Chip', () => {
  it('exposes its selected state to screen readers', async () => {
    await render(<Chip label="coding" selected onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'coding' })).toBeSelected();
  });
});
