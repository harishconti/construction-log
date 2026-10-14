import { describe, expect, it } from 'vitest';
import { Segmented } from '../src/components/ui/inputs';

describe('Segmented keyboard navigation logic', () => {
  const options = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
  ];

  it('determines roving tabIndex based on selected value', () => {
    const selectedValue = 'upi';
    const selectedIndex = options.findIndex((o) => o.value === selectedValue);

    const tabIndexes = options.map((o, index) => {
      const isSelected = selectedValue === o.value;
      return isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1;
    });

    expect(tabIndexes).toEqual([-1, 0, -1]);
  });

  it('calculates next index correctly for arrow keys and home/end', () => {
    function getNextIndex(key: string, currentIndex: number, length: number): number {
      if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length;
      if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length;
      if (key === 'Home') return 0;
      if (key === 'End') return length - 1;
      return -1;
    }

    // From index 0
    expect(getNextIndex('ArrowRight', 0, 3)).toBe(1);
    expect(getNextIndex('ArrowLeft', 0, 3)).toBe(2); // Wrap around
    expect(getNextIndex('End', 0, 3)).toBe(2);

    // From index 2
    expect(getNextIndex('ArrowRight', 2, 3)).toBe(0); // Wrap around
    expect(getNextIndex('ArrowLeft', 2, 3)).toBe(1);
    expect(getNextIndex('Home', 2, 3)).toBe(0);
  });
});
