// Selective sync filter and path matching

use regex::Regex;

#[derive(Debug, Clone)]
pub struct SyncFilter {
    #[allow(dead_code)]
    excluded_patterns: Vec<String>,
    regexes: Vec<Regex>,
}

impl Default for SyncFilter {
    fn default() -> Self {
        Self::new(vec![])
    }
}

impl SyncFilter {
    pub fn new(custom_patterns: Vec<String>) -> Self {
        // Built-in default ignore list
        let mut patterns = vec![
            r"^\.noty(/.*)?$".to_string(),
            r"^\.obsidian/workspace(\.json)?$".to_string(),
            r"^\.obsidian/appearance(\.json)?$".to_string(),
            r"^\.git(/.*)?$".to_string(),
            r"^\.trash(/.*)?$".to_string(),
            r".*\.sync-conflict-.*".to_string(),
            r"^\.DS_Store$".to_string(),
            r"^Thumbs\.db$".to_string(),
        ];

        patterns.extend(custom_patterns);

        let regexes = patterns
            .iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();

        Self {
            excluded_patterns: patterns,
            regexes,
        }
    }

    /// Returns true if the relative path should be excluded from sync
    pub fn is_excluded(&self, path: &str) -> bool {
        let normalized = path.replace('\\', "/");
        let trimmed = normalized.trim_start_matches('/');

        for re in &self.regexes {
            if re.is_match(trimmed) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_exclusions() {
        let filter = SyncFilter::default();

        assert!(filter.is_excluded(".obsidian/workspace.json"));
        assert!(filter.is_excluded(".obsidian/appearance.json"));
        assert!(filter.is_excluded(".noty/sync.db"));
        assert!(filter.is_excluded(".git/config"));
        assert!(filter.is_excluded(".trash/old.md"));
        assert!(filter.is_excluded("note.sync-conflict-device-123.md"));
        assert!(filter.is_excluded(".DS_Store"));

        // Regular notes should NOT be excluded
        assert!(!filter.is_excluded("notes/daily.md"));
        assert!(!filter.is_excluded("assets/image.png"));
        assert!(!filter.is_excluded(".obsidian/app.json"));
    }
}
