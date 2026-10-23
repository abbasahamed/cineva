import React, { useRef, useEffect } from 'react';

export interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  hasError?: boolean;
  autoFocus?: boolean;
  className?: string;
  id?: string;
}

export const CodeInput: React.FC<CodeInputProps> = ({
  value,
  onChange,
  onComplete,
  hasError = false,
  autoFocus = false,
  className = '',
  id = 'code',
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const clean = (str: string) => str.replace(/[^a-zA-Z0-9]/gi, '').toUpperCase();

  // Array of 6 characters
  const chars = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const cleaned = clean(rawVal);
    const lastChar = cleaned.slice(-1);

    const newChars = [...chars];
    newChars[index] = lastChar;
    const nextVal = newChars.join('').slice(0, 6);
    onChange(nextVal);

    if (lastChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (nextVal.length === 6 && onComplete) {
      onComplete(nextVal);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!chars[index] && index > 0) {
        e.preventDefault();
        const newChars = [...chars];
        newChars[index - 1] = '';
        const nextVal = newChars.join('');
        onChange(nextVal);
        inputRefs.current[index - 1]?.focus();
      } else if (chars[index]) {
        e.preventDefault();
        const newChars = [...chars];
        newChars[index] = '';
        const nextVal = newChars.join('');
        onChange(nextVal);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    let pastedText = '';
    if (e.clipboardData) {
      pastedText =
        e.clipboardData.getData('text') ||
        e.clipboardData.getData('Text') ||
        e.clipboardData.getData('text/plain') ||
        '';
    }
    const cleaned = clean(pastedText).slice(0, 6);
    if (!cleaned) return;

    onChange(cleaned);
    const focusIdx = Math.min(cleaned.length, 5);
    inputRefs.current[focusIdx]?.focus();

    if (cleaned.length === 6 && onComplete) {
      onComplete(cleaned);
    }
  };

  return (
    <div
      id={id}
      className={`cineva-code ${hasError ? 'bad' : ''} ${className}`.trim()}
      role="group"
      aria-label="Room code"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          maxLength={1}
          value={chars[i] || ''}
          placeholder=" "
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label={`Character ${i + 1}`}
          aria-invalid={hasError}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
};
