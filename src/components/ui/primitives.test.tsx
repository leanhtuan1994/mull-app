import { fireEvent, render, screen } from '@/lib/test-utils';

import { ModelMonogram, monogramGlyph } from './model-monogram';
import { ProgressButton } from './progress-button';
import { ProgressRing, ringGeometry } from './progress-ring';
import { SegmentedControl } from './segmented-control';

describe('ProgressRing', () => {
  it('maps the fraction to the stroke dash offset', () => {
    const { circumference, dashOffset } = ringGeometry(26, 2, 0.25);
    expect(circumference).toBeCloseTo(2 * Math.PI * 12);
    expect(dashOffset).toBeCloseTo(circumference * 0.75);
    expect(ringGeometry(26, 2, 1.4).dashOffset).toBe(0);
    expect(ringGeometry(26, 2, -1).dashOffset).toBeCloseTo(circumference);
  });

  it('renders the value circle with that offset', async () => {
    await render(<ProgressRing fraction={0.5} testID="ring" />);
    const value = screen.getByTestId('ring-value', {
      includeHiddenElements: true,
    });
    const { dashOffset } = ringGeometry(26, 2.5, 0.5);
    expect(value.props.strokeDashoffset).toBeCloseTo(dashOffset);
  });
});

describe('ModelMonogram', () => {
  it('shows the first letter in the family color', async () => {
    await render(<ModelMonogram name="qwen3" family="qwen" size={40} />);
    expect(screen.getByText('Q', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getByTestId('model-monogram', { includeHiddenElements: true })
    ).toHaveStyle({
      backgroundColor: '#4B4F8F',
      width: 40,
    });
  });

  it('handles accented and empty names', () => {
    expect(monogramGlyph('ếch')).toBe('Ế');
    expect(monogramGlyph('  ')).toBe('?');
  });
});

describe('ProgressButton', () => {
  it('fills to the progress and exposes it to VoiceOver', async () => {
    const onPress = jest.fn();
    await render(
      <ProgressButton
        label="Đang tải 40%"
        progress={0.4}
        onPress={onPress}
        testID="dl"
      />
    );
    expect(screen.getByTestId('dl-fill')).toHaveStyle({ width: '40%' });
    expect(screen.getByTestId('dl').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 40,
    });
    fireEvent.press(screen.getByTestId('dl'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  it('marks the selected option and reports changes', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        accessibilityLabel="Độ dài"
        value="medium"
        onChange={onChange}
        options={[
          { value: 'short', label: 'Ngắn' },
          { value: 'medium', label: 'Vừa' },
        ]}
      />
    );
    expect(screen.getByLabelText('Vừa').props.accessibilityState).toMatchObject(
      {
        selected: true,
      }
    );
    fireEvent.press(screen.getByLabelText('Ngắn'));
    expect(onChange).toHaveBeenCalledWith('short');
  });
});
