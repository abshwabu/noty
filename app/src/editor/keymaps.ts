import type { Command } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';

/**
 * Smart list continuation on Enter:
 * - Checks current line for list markers (- , * , + , 1. , - [ ] , - [x] )
 * - If the line only contains the marker without any text, delete the marker (break out of list)
 * - Otherwise, insert newline with matching marker (or incremented number for ordered lists)
 */
export const insertSmartNewline: Command = (view) => {
  const { state } = view;
  const { selection } = state;
  const line = state.doc.lineAt(selection.main.head);
  const text = line.text;

  // 1. Task list item: e.g. "   - [ ] " or "   - [x] "
  const taskMatch = text.match(/^(\s*)([-*+]\s+\[[ xX]\]\s*)(.*)$/);
  if (taskMatch) {
    const indent = taskMatch[1];
    const marker = taskMatch[2];
    const rest = taskMatch[3];

    // If task is empty and cursor is at the end of marker, clear it
    if (!rest.trim() && selection.main.head >= line.from + indent.length + marker.length) {
      view.dispatch({
        changes: {
          from: line.from + indent.length,
          to: line.to,
          insert: '',
        },
        selection: { anchor: line.from + indent.length },
      });
      return true;
    }

    const nextTask = `\n${indent}- [ ] `;
    view.dispatch(state.replaceSelection(nextTask));
    return true;
  }

  // 2. Unordered bullet list item: e.g. "   - " or "   * " or "   + "
  const bulletMatch = text.match(/^(\s*)([-*+]\s+)(.*)$/);
  if (bulletMatch) {
    const indent = bulletMatch[1];
    const marker = bulletMatch[2];
    const rest = bulletMatch[3];

    if (!rest.trim() && selection.main.head >= line.from + indent.length + marker.length) {
      view.dispatch({
        changes: {
          from: line.from + indent.length,
          to: line.to,
          insert: '',
        },
        selection: { anchor: line.from + indent.length },
      });
      return true;
    }

    const nextBullet = `\n${indent}${marker}`;
    view.dispatch(state.replaceSelection(nextBullet));
    return true;
  }

  // 3. Ordered list item: e.g. "   1. " or "   2) "
  const numMatch = text.match(/^(\s*)(\d+)([.)]\s+)(.*)$/);
  if (numMatch) {
    const indent = numMatch[1];
    const num = parseInt(numMatch[2], 10);
    const delim = numMatch[3];
    const rest = numMatch[4];

    if (!rest.trim() && selection.main.head >= line.from + indent.length + numMatch[2].length + delim.length) {
      view.dispatch({
        changes: {
          from: line.from + indent.length,
          to: line.to,
          insert: '',
        },
        selection: { anchor: line.from + indent.length },
      });
      return true;
    }

    const nextNum = `\n${indent}${num + 1}${delim}`;
    view.dispatch(state.replaceSelection(nextNum));
    return true;
  }

  // Fallback: normal Enter
  return false;
};

/**
 * Smart tab handling:
 * On list items, Tab indents the item; Shift+Tab outdents.
 */
export const smartIndent: Command = (view) => {
  return indentMore(view);
};

export const smartOutdent: Command = (view) => {
  return indentLess(view);
};

/**
 * Toggle task item checkbox at current cursor position
 */
export const toggleTaskUnderCursor: Command = (view) => {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const text = line.text;

  const unchecked = text.match(/^(\s*[-*+]\s+\[) (\].*)$/);
  if (unchecked) {
    const from = line.from + unchecked[1].length;
    view.dispatch({
      changes: { from, to: from + 1, insert: 'x' },
    });
    return true;
  }

  const checked = text.match(/^(\s*[-*+]\s+\[)[xX](\].*)$/);
  if (checked) {
    const from = line.from + checked[1].length;
    view.dispatch({
      changes: { from, to: from + 1, insert: ' ' },
    });
    return true;
  }

  return false;
};
