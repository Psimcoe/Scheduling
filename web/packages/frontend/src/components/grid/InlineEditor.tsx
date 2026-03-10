/**
 * Inline cell editor — handles text, number, date, duration inputs.
 */

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { TextField } from '@mui/material';

interface InlineEditorProps {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  type?: 'text' | 'number' | 'date' | 'duration';
  selectAllOnFocus?: boolean;
}

const InlineEditor: React.FC<InlineEditorProps> = ({
  value,
  onCommit,
  onCancel,
  type = 'text',
  selectAllOnFocus = true,
}) => {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (selectAllOnFocus) {
        inputRef.current.select();
      }
    }
  }, [selectAllOnFocus]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(editValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab') {
      onCommit(editValue);
    }
  };

  const inputType = type === 'date' ? 'date' : type === 'number' ? 'number' : 'text';

  return (
    <TextField
      inputRef={inputRef}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onCommit(editValue)}
      type={inputType}
      size="small"
      variant="standard"
      fullWidth
      slotProps={{
        input: {
          disableUnderline: false,
          sx: {
            fontSize: '0.8125rem',
            padding: '0 4px',
            height: '24px',
          },
        },
      }}
    />
  );
};

export default InlineEditor;
