import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';
import { useVaultStore } from '../stores/vault';
import { getTags, getOutline } from '../services/metadata';

export function wikilinkAutocomplete() {
  return autocompletion({
    override: [wikilinkAndTagCompletionSource],
    defaultKeymap: true,
  });
}

export async function wikilinkAndTagCompletionSource(
  context: CompletionContext
): Promise<CompletionResult | null> {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 1. Check for wikilink trigger: [[query
  const wikilinkMatch = textBefore.match(/\[\[([^\]]*)$/);
  if (wikilinkMatch) {
    const rawQuery = wikilinkMatch[1];
    const from = context.pos - rawQuery.length;
    const vault = useVaultStore();

    // Case A: Block query e.g. [[Note#^block or [[#^block
    if (rawQuery.includes('#^')) {
      const [notePart] = rawQuery.split('#^');
      return {
        from: from + notePart.length + 2,
        options: [
          { label: 'block-intro', type: 'variable', apply: 'block-intro]]' },
          { label: 'block-tasks', type: 'variable', apply: 'block-tasks]]' },
          { label: 'block-summary', type: 'variable', apply: 'block-summary]]' },
        ],
      };
    }

    // Case B: Heading query e.g. [[Note#heading or [[#heading
    if (rawQuery.includes('#')) {
      const [notePart] = rawQuery.split('#');
      const targetPath = notePart
        ? notePart.endsWith('.md')
          ? notePart
          : `${notePart}.md`
        : vault.activeFilePath || '';

      let headings: string[] = [];
      if (targetPath) {
        try {
          const items = await getOutline(targetPath);
          headings = items.map((h) => h.text);
        } catch {
          headings = ['Overview', 'Tasks', 'Summary'];
        }
      }

      if (headings.length === 0) {
        headings = ['Overview', 'Notes', 'Conclusion'];
      }

      return {
        from: from + notePart.length + 1,
        options: headings.map((h) => ({
          label: h,
          type: 'class',
          apply: `${h}]]`,
        })),
      };
    }

    // Case C: Current note block query e.g. [[^block
    if (rawQuery.startsWith('^')) {
      return {
        from: from + 1,
        options: [
          { label: 'block-intro', type: 'variable', apply: 'block-intro]]' },
          { label: 'block-tasks', type: 'variable', apply: 'block-tasks]]' },
        ],
      };
    }

    // Case D: Note files autocomplete
    const allNotes = vault.allFilePaths
      .filter((p) => p.endsWith('.md'))
      .map((p) => p.replace(/\.md$/, ''));

    const options: Completion[] = (allNotes.length > 0
      ? allNotes
      : ['Welcome', 'Obsidian Import', 'Projects/Noty']
    ).map((name) => {
      const stem = name.split('/').pop() || name;
      return {
        label: stem,
        detail: name !== stem ? name : undefined,
        type: 'file',
        apply: (view, _completion, fromPos, toPos) => {
          view.dispatch({
            changes: { from: fromPos, to: toPos, insert: `${stem}]]` },
          });
        },
      };
    });

    return {
      from,
      options,
      filter: true,
    };
  }

  // 2. Check for Tag trigger: #tag
  const tagMatch = textBefore.match(/(?:^|\s)#([a-zA-Z0-9_\-/]*)$/);
  if (tagMatch) {
    const rawTag = tagMatch[1];
    const from = context.pos - rawTag.length;

    let availableTags: string[] = [];
    try {
      const tagItems = await getTags();
      availableTags = tagItems.map((t) => t.tag);
    } catch {
      availableTags = ['obsidian', 'project', 'tauri', 'rust', 'mobile', 'notes'];
    }

    if (availableTags.length === 0) {
      availableTags = ['obsidian', 'project', 'tauri', 'rust', 'mobile', 'notes'];
    }

    return {
      from,
      options: availableTags.map((tag) => ({
        label: tag,
        type: 'keyword',
        apply: `${tag} `,
      })),
      filter: true,
    };
  }

  return null;
}
