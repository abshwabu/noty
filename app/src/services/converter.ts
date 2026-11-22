export function convertMarkdownLinksToWikilinks(text: string): string {
  // Matches [Label](target.md) or [Label](target)
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, target) => {
    // Avoid converting external web URLs
    if (/^https?:\/\//i.test(target) || /^mailto:/i.test(target)) {
      return match;
    }

    const cleanTarget = target.replace(/\.md$/i, '');
    if (label.trim() === cleanTarget.trim() || label.trim() === target.trim()) {
      return `[[${cleanTarget}]]`;
    }
    return `[[${cleanTarget}|${label}]]`;
  });
}

export function convertWikilinksToMarkdownLinks(text: string): string {
  // Matches ![[target]] (embeds) or [[target|alias]] or [[target]]
  return text.replace(/(?<!\!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    const cleanTarget = target.trim();
    const label = alias ? alias.trim() : cleanTarget;
    const pathWithExt = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`;
    return `[${label}](${pathWithExt})`;
  });
}

export function convertHtmlFormattingToMarkdown(text: string): string {
  let out = text;
  // Bold
  out = out.replace(/<\/?(b|strong)>/gi, '**');
  // Italic
  out = out.replace(/<\/?(i|em)>/gi, '*');
  // Strike
  out = out.replace(/<\/?(s|del|strike)>/gi, '~~');
  // Inline code
  out = out.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  return out;
}
