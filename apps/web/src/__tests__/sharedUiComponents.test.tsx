// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CodeInput } from '../components/ui/CodeInput.js';

afterEach(() => {
  cleanup();
});

describe('Shared UI Components — CodeInput', () => {
  it('renders 6 input boxes', () => {
    render(<CodeInput value="" onChange={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
  });

  it('filters non-alphanumeric characters and converts to uppercase', () => {
    let code = '';
    const handleChange = vi.fn((val) => { code = val; });

    const { rerender } = render(<CodeInput value={code} onChange={handleChange} />);
    const inputs = screen.getAllByRole('textbox');

    fireEvent.change(inputs[0], { target: { value: 'a' } });
    expect(handleChange).toHaveBeenCalledWith('A');

    rerender(<CodeInput value="A" onChange={handleChange} />);
    fireEvent.change(inputs[1], { target: { value: '9' } });
    expect(handleChange).toHaveBeenCalledWith('A9');

    // Special characters rejected
    fireEvent.change(inputs[2], { target: { value: '$' } });
    expect(handleChange).toHaveBeenCalledWith('A');
  });

  it('auto-advances focus to the next input when a character is entered', () => {
    render(<CodeInput value="" onChange={() => {}} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

    inputs[0].focus();
    expect(document.activeElement).toBe(inputs[0]);

    fireEvent.change(inputs[0], { target: { value: 'X' } });
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('navigates back and clears on Backspace when current box is empty', () => {
    let code = 'AB';
    const handleChange = vi.fn((val) => { code = val; });

    render(<CodeInput value={code} onChange={handleChange} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: 'Backspace' });

    expect(handleChange).toHaveBeenCalledWith('A');
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('handles paste of full 6-character code and calls onComplete', () => {
    let code = '';
    const handleChange = vi.fn((val) => { code = val; });
    const handleComplete = vi.fn();

    render(<CodeInput value={code} onChange={handleChange} onComplete={handleComplete} />);
    const inputs = screen.getAllByRole('textbox');

    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => 'xyz-123',
      },
    });

    expect(handleChange).toHaveBeenCalledWith('XYZ123');
    expect(handleComplete).toHaveBeenCalledWith('XYZ123');
  });
});

import { ThemeProvider, THEME_OPTIONS } from '../context/ThemeContext.js';
import { ThemeSelector } from '../components/ThemeSelector.js';

describe('Shared UI Components — ThemeSelector & ThemeContext', () => {
  it('provides exactly 5 theme colors', () => {
    expect(THEME_OPTIONS).toHaveLength(5);
    const ids = THEME_OPTIONS.map((t) => t.id);
    expect(ids).toEqual(['blue', 'purple', 'emerald', 'amber', 'rose']);
  });

  it('renders theme button and toggles 5 colors dropdown on click', () => {
    render(
      <ThemeProvider>
        <ThemeSelector />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /change theme color/i });
    expect(button).toBeDefined();

    // Click to open dropdown
    fireEvent.click(button);

    // Verify all 5 color options are listed
    expect(screen.getByText('Electric Blue')).toBeDefined();
    expect(screen.getByText('Cyber Purple')).toBeDefined();
    expect(screen.getByText('Neon Emerald')).toBeDefined();
    expect(screen.getByText('Solar Amber')).toBeDefined();
    expect(screen.getByText('Vibrant Rose')).toBeDefined();

    // Switch to Cyber Purple
    fireEvent.click(screen.getByText('Cyber Purple'));
    expect(document.documentElement.classList.contains('theme-purple')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('purple');
  });
});
