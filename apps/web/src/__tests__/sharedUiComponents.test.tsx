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
