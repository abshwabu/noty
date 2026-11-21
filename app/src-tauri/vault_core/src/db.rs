use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacklinkItem {
    pub source_path: String,
    pub source_title: String,
    pub line_number: usize,
    pub context_snippet: String,
    pub alias: Option<String>,
    pub heading: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlinkedMentionItem {
    pub source_path: String,
    pub source_title: String,
    pub line_number: usize,
    pub match_text: String,
    pub context_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacklinksResult {
    pub linked_mentions: Vec<BacklinkItem>,
    pub unlinked_mentions: Vec<UnlinkedMentionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutgoingLinkItem {
    pub target_note: String,
    pub display_text: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub is_embed: bool,
    pub is_resolved: bool,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagCountItem {
    pub tag: String,
    pub count: usize,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadingItem {
    pub level: usize,
    pub text: String,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub link_count: usize,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

pub struct MetadataIndex {
    db_path: PathBuf,
}

impl MetadataIndex {
    pub fn new(vault_path: &Path) -> Result<Self, String> {
        let app_dir = vault_path.join(".noty");
        if !app_dir.exists() {
            let _ = fs::create_dir_all(&app_dir);
        }
        let db_path = app_dir.join("metadata.db");
        let index = Self { db_path };
        index.init_schema()?;
        Ok(index)
    }

    fn get_connection(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|e| format!("Failed to open metadata db: {}", e))
    }

    pub fn init_schema(&self) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                mtime INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_path TEXT NOT NULL,
                target_note TEXT NOT NULL,
                alias TEXT,
                heading TEXT,
                block TEXT,
                is_embed INTEGER NOT NULL DEFAULT 0,
                line_number INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                tag TEXT NOT NULL,
                line_number INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS headings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                heading_text TEXT NOT NULL,
                level INTEGER NOT NULL,
                line_number INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                block_id TEXT NOT NULL,
                line_number INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                alias TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS properties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                key TEXT NOT NULL,
                value_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                task_text TEXT NOT NULL,
                completed INTEGER NOT NULL,
                line_number INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);
            CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note);
            CREATE INDEX IF NOT EXISTS idx_tags_file ON tags(file_path);
            CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
            CREATE INDEX IF NOT EXISTS idx_headings_file ON headings(file_path);
            "#,
        )
        .map_err(|e| format!("Failed to initialize database schema: {}", e))?;
        Ok(())
    }

    pub fn index_file(
        &self,
        relative_path: &str,
        content: &str,
        mtime: i64,
    ) -> Result<(), String> {
        let mut conn = self.get_connection()?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("Transaction error: {}", e))?;

        // Clear previous rows for this file
        tx.execute("DELETE FROM files WHERE path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM links WHERE source_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM tags WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM headings WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM blocks WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM aliases WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM properties WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM tasks WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO files (path, mtime) VALUES (?1, ?2)",
            params![relative_path, mtime],
        )
        .map_err(|e| e.to_string())?;

        // 1. Parse YAML Frontmatter
        let lines: Vec<&str> = content.lines().collect();
        let mut body_start_line = 0;

        if !lines.is_empty() && lines[0].trim() == "---" {
            let mut yaml_lines = Vec::new();
            let mut idx = 1;
            while idx < lines.len() && lines[idx].trim() != "---" {
                yaml_lines.push(lines[idx]);
                idx += 1;
            }
            if idx < lines.len() && lines[idx].trim() == "---" {
                body_start_line = idx + 1;
                // Parse simple YAML properties
                for yline in yaml_lines {
                    let yline_trimmed = yline.trim();
                    if let Some((k, v)) = yline_trimmed.split_once(':') {
                        let key = k.trim().to_string();
                        let val = v.trim();

                        if key == "aliases" || key == "alias" {
                            // Can be [a, b] or comma separated
                            let cleaned = val.trim_matches(|c| c == '[' || c == ']' || c == '"' || c == '\'');
                            for alias in cleaned.split(',') {
                                let a = alias.trim();
                                if !a.is_empty() {
                                    let _ = tx.execute(
                                        "INSERT INTO aliases (file_path, alias) VALUES (?1, ?2)",
                                        params![relative_path, a],
                                    );
                                }
                            }
                        } else if key == "tags" || key == "tag" {
                            let cleaned = val.trim_matches(|c| c == '[' || c == ']' || c == '"' || c == '\'');
                            for t in cleaned.split(',') {
                                let tag_clean = t.trim().trim_start_matches('#');
                                if !tag_clean.is_empty() {
                                    let _ = tx.execute(
                                        "INSERT INTO tags (file_path, tag, line_number) VALUES (?1, ?2, ?3)",
                                        params![relative_path, tag_clean, 0],
                                    );
                                }
                            }
                        } else {
                            let _ = tx.execute(
                                "INSERT INTO properties (file_path, key, value_json) VALUES (?1, ?2, ?3)",
                                params![relative_path, key, serde_json::to_string(&val).unwrap_or_default()],
                            );
                        }
                    }
                }
            }
        }

        // 2. Scan lines for Wikilinks, Embeds, Inline Tags, Headings, Blocks
        for (i, line) in lines.iter().enumerate().skip(body_start_line) {
            let line_num = i + 1;
            let text = *line;

            // Headings: # Heading
            if let Some(heading_match) = parse_heading(text) {
                let _ = tx.execute(
                    "INSERT INTO headings (file_path, heading_text, level, line_number) VALUES (?1, ?2, ?3, ?4)",
                    params![relative_path, heading_match.0, heading_match.1 as i64, line_num as i64],
                );
            }

            // Block id: ^block-id at end of line
            if let Some(block_id) = parse_block_id(text) {
                let _ = tx.execute(
                    "INSERT INTO blocks (file_path, block_id, line_number) VALUES (?1, ?2, ?3)",
                    params![relative_path, block_id, line_num as i64],
                );
            }

            // Wikilinks: [[Note]], [[Note|Alias]], [[Note#Heading]], [[Note#^Block]]
            // and embeds: ![[Note]], ![[Image.png]]
            for link in parse_wikilinks(text) {
                let _ = tx.execute(
                    "INSERT INTO links (source_path, target_note, alias, heading, block, is_embed, line_number)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        relative_path,
                        link.target_note,
                        link.alias,
                        link.heading,
                        link.block,
                        link.is_embed as i64,
                        line_num as i64,
                    ],
                );
            }

            // Inline tags: #tag or #nested/tag
            for tag in parse_inline_tags(text) {
                let _ = tx.execute(
                    "INSERT INTO tags (file_path, tag, line_number) VALUES (?1, ?2, ?3)",
                    params![relative_path, tag, line_num as i64],
                );
            }

            // Tasks: - [ ] or - [x]
            let trimmed = text.trim();
            if trimmed.starts_with("- [ ] ") || trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ") {
                let completed = if trimmed.starts_with("- [ ] ") { 0 } else { 1 };
                let task_text = &trimmed[6..];
                let _ = tx.execute(
                    "INSERT INTO tasks (file_path, task_text, completed, line_number) VALUES (?1, ?2, ?3, ?4)",
                    params![relative_path, task_text, completed, line_num as i64],
                );
            }
        }

        tx.commit().map_err(|e| format!("Commit error: {}", e))?;
        Ok(())
    }

    pub fn delete_file(&self, relative_path: &str) -> Result<(), String> {
        let conn = self.get_connection()?;
        conn.execute("DELETE FROM files WHERE path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM links WHERE source_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM tags WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM headings WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM blocks WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM aliases WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM properties WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM tasks WHERE file_path = ?1", params![relative_path])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn index_all_files(&self, vault_path: &Path) -> Result<usize, String> {
        let mut count = 0;
        fn visit_dir(dir: &Path, vault_path: &Path, index: &MetadataIndex, count: &mut usize) -> Result<(), String> {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.starts_with('.') {
                        continue;
                    }
                    if path.is_dir() {
                        visit_dir(&path, vault_path, index, count)?;
                    } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let rel = path
                                .strip_prefix(vault_path)
                                .unwrap_or(&path)
                                .to_string_lossy()
                                .replace('\\', "/");
                            let mtime = entry
                                .metadata()
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64)
                                .unwrap_or(0);
                            if index.index_file(&rel, &content, mtime).is_ok() {
                                *count += 1;
                            }
                        }
                    }
                }
            }
            Ok(())
        }

        visit_dir(vault_path, vault_path, self, &mut count)?;
        Ok(count)
    }

    // --- Query APIs ---

    pub fn get_backlinks(&self, relative_path: &str, vault_path: &Path) -> Result<BacklinksResult, String> {
        let conn = self.get_connection()?;
        let note_stem = Path::new(relative_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(relative_path);

        // 1. Linked Mentions
        let mut stmt = conn
            .prepare(
                r#"
                SELECT source_path, alias, heading, line_number
                FROM links
                WHERE target_note = ?1 OR target_note = ?2
                ORDER BY source_path ASC, line_number ASC
                "#,
            )
            .map_err(|e| e.to_string())?;

        let mut linked = Vec::new();
        let rows = stmt
            .query_map(params![relative_path, note_stem], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)? as usize,
                ))
            })
            .map_err(|e| e.to_string())?;

        for r in rows {
            let (source_path, alias, heading, line_number) = r.map_err(|e| e.to_string())?;
            let source_title = Path::new(&source_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&source_path)
                .to_string();

            let snippet = self.get_line_snippet(vault_path, &source_path, line_number);
            linked.push(BacklinkItem {
                source_path,
                source_title,
                line_number,
                context_snippet: snippet,
                alias,
                heading,
            });
        }

        // 2. Unlinked Mentions (Note title appears in file text but not as a [[wikilink]])
        let mut unlinked = Vec::new();
        if note_stem.len() >= 3 {
            let mut file_stmt = conn
                .prepare("SELECT path FROM files WHERE path != ?1")
                .map_err(|e| e.to_string())?;

            let file_rows = file_stmt
                .query_map(params![relative_path], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;

            for f_res in file_rows {
                let file_path = f_res.map_err(|e| e.to_string())?;
                let full = vault_path.join(&file_path);
                if let Ok(text) = fs::read_to_string(&full) {
                    for (line_idx, line) in text.lines().enumerate() {
                        let lower_line = line.to_lowercase();
                        let lower_target = note_stem.to_lowercase();
                        if let Some(pos) = lower_line.find(&lower_target) {
                            // Check that it's not already enclosed in [[...]]
                            let is_linked = line.contains(&format!("[[{}", note_stem))
                                || line.contains(&format!("[[{}|", note_stem))
                                || line.contains(&format!("[[{}#", note_stem));

                            if !is_linked {
                                let match_slice = &line[pos..pos + note_stem.len()];
                                unlinked.push(UnlinkedMentionItem {
                                    source_path: file_path.clone(),
                                    source_title: Path::new(&file_path)
                                        .file_stem()
                                        .and_then(|s| s.to_str())
                                        .unwrap_or(&file_path)
                                        .to_string(),
                                    line_number: line_idx + 1,
                                    match_text: match_slice.to_string(),
                                    context_snippet: line.trim().to_string(),
                                });
                                break; // Limit to 1 unlinked mention per file
                            }
                        }
                    }
                }
            }
        }

        Ok(BacklinksResult {
            linked_mentions: linked,
            unlinked_mentions: unlinked,
        })
    }

    pub fn get_outgoing_links(&self, relative_path: &str, vault_path: &Path) -> Result<Vec<OutgoingLinkItem>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT target_note, alias, heading, block, is_embed, line_number
                FROM links
                WHERE source_path = ?1
                ORDER BY line_number ASC
                "#,
            )
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        let rows = stmt
            .query_map(params![relative_path], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)? != 0,
                    row.get::<_, i64>(5)? as usize,
                ))
            })
            .map_err(|e| e.to_string())?;

        for r in rows {
            let (target_note, alias, heading, block, is_embed, line_number) =
                r.map_err(|e| e.to_string())?;

            let display_text = alias.clone().unwrap_or_else(|| target_note.clone());

            // Check if resolved (target file exists in vault)
            let is_resolved = vault_path.join(format!("{}.md", target_note)).exists()
                || vault_path.join(&target_note).exists();

            results.push(OutgoingLinkItem {
                target_note,
                display_text,
                heading,
                block,
                is_embed,
                is_resolved,
                line_number,
            });
        }

        Ok(results)
    }

    pub fn get_tags(&self) -> Result<Vec<TagCountItem>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT tag, file_path
                FROM tags
                ORDER BY tag ASC
                "#,
            )
            .map_err(|e| e.to_string())?;

        let mut map: HashMap<String, HashSet<String>> = HashMap::new();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for r in rows {
            let (tag, file) = r.map_err(|e| e.to_string())?;
            map.entry(tag).or_default().insert(file);
        }

        let mut items: Vec<TagCountItem> = map
            .into_iter()
            .map(|(tag, files_set)| {
                let mut files: Vec<String> = files_set.into_iter().collect();
                files.sort();
                let count = files.len();
                TagCountItem { tag, count, files }
            })
            .collect();

        items.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
        Ok(items)
    }

    pub fn get_outline(&self, relative_path: &str) -> Result<Vec<HeadingItem>, String> {
        let conn = self.get_connection()?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT level, heading_text, line_number
                FROM headings
                WHERE file_path = ?1
                ORDER BY line_number ASC
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![relative_path], |row| {
                Ok(HeadingItem {
                    level: row.get::<_, i64>(0)? as usize,
                    text: row.get::<_, String>(1)?,
                    line_number: row.get::<_, i64>(2)? as usize,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut headings = Vec::new();
        for r in rows {
            headings.push(r.map_err(|e| e.to_string())?);
        }
        Ok(headings)
    }

    pub fn get_graph_data(&self) -> Result<GraphData, String> {
        let conn = self.get_connection()?;

        // 1. Nodes
        let mut file_stmt = conn.prepare("SELECT path FROM files").map_err(|e| e.to_string())?;
        let file_rows = file_stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        let mut nodes = Vec::new();
        let mut all_files = HashSet::new();

        for f_res in file_rows {
            let path = f_res.map_err(|e| e.to_string())?;
            all_files.insert(path.clone());
            let name = Path::new(&path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&path)
                .to_string();

            nodes.push(GraphNode {
                id: path.clone(),
                name,
                path,
                link_count: 0,
                tags: Vec::new(),
            });
        }

        // 2. Links / Edges
        let mut link_stmt = conn
            .prepare("SELECT source_path, target_note FROM links WHERE is_embed = 0")
            .map_err(|e| e.to_string())?;

        let link_rows = link_stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        let mut edges = Vec::new();
        let mut edge_set = HashSet::new();
        let mut connection_counts: HashMap<String, usize> = HashMap::new();

        for r in link_rows {
            let (source, target_raw) = r.map_err(|e| e.to_string())?;
            let target = if target_raw.ends_with(".md") {
                target_raw
            } else {
                format!("{}.md", target_raw)
            };

            // Edge key
            let key = format!("{}->{}", source, target);
            if !edge_set.contains(&key) && source != target {
                edge_set.insert(key);
                edges.push(GraphEdge {
                    source: source.clone(),
                    target: target.clone(),
                });
                *connection_counts.entry(source).or_insert(0) += 1;
                *connection_counts.entry(target).or_insert(0) += 1;
            }
        }

        // Update link_count on nodes
        for node in &mut nodes {
            node.link_count = *connection_counts.get(&node.id).unwrap_or(&0);
        }

        Ok(GraphData { nodes, edges })
    }

    fn get_line_snippet(&self, vault_path: &Path, rel_path: &str, line_num: usize) -> String {
        let full = vault_path.join(rel_path);
        if let Ok(content) = fs::read_to_string(full) {
            if let Some(line) = content.lines().nth(line_num.saturating_sub(1)) {
                return line.trim().to_string();
            }
        }
        String::new()
    }
}

// --- Parsing Helpers ---

pub struct ParsedLink {
    pub target_note: String,
    pub alias: Option<String>,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub is_embed: bool,
}

pub fn parse_wikilinks(line: &str) -> Vec<ParsedLink> {
    let mut links = Vec::new();
    let mut idx = 0;
    let chars: Vec<char> = line.chars().collect();

    while idx + 1 < chars.len() {
        if chars[idx] == '[' && chars[idx + 1] == '[' {
            let is_embed = idx > 0 && chars[idx - 1] == '!';
            let start = idx + 2;
            let mut end = start;
            while end + 1 < chars.len() && !(chars[end] == ']' && chars[end + 1] == ']') {
                end += 1;
            }
            if end + 1 < chars.len() {
                let inner: String = chars[start..end].iter().collect();
                if let Some(parsed) = parse_link_inner(&inner, is_embed) {
                    links.push(parsed);
                }
                idx = end + 2;
                continue;
            }
        }
        idx += 1;
    }
    links
}

fn parse_link_inner(inner: &str, is_embed: bool) -> Option<ParsedLink> {
    if inner.trim().is_empty() {
        return None;
    }

    let (main_part, alias) = if let Some((m, a)) = inner.split_once('|') {
        (m.trim(), Some(a.trim().to_string()))
    } else {
        (inner.trim(), None)
    };

    let (target_and_heading, block) = if let Some((th, b)) = main_part.split_once('^') {
        (th.trim(), Some(b.trim().to_string()))
    } else {
        (main_part, None)
    };

    let (target, heading) = if let Some((t, h)) = target_and_heading.split_once('#') {
        (t.trim(), Some(h.trim().to_string()))
    } else {
        (target_and_heading, None)
    };

    Some(ParsedLink {
        target_note: target.to_string(),
        alias,
        heading,
        block,
        is_embed,
    })
}

pub fn parse_inline_tags(line: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let words = line.split_whitespace();
    for word in words {
        if word.starts_with('#') && word.len() > 1 {
            let tag_candidate = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '/' && c != '_' && c != '-');
            if !tag_candidate.is_empty()
                && !tag_candidate.chars().all(|c| c.is_ascii_hexdigit())
                && !tag_candidate.starts_with('#')
            {
                tags.push(tag_candidate.to_string());
            }
        }
    }
    tags
}

pub fn parse_heading(line: &str) -> Option<(String, usize)> {
    if !line.starts_with('#') {
        return None;
    }
    let count = line.chars().take_while(|c| *c == '#').count();
    if count >= 1 && count <= 6 && line[count..].starts_with(' ') {
        let text = line[count..].trim().to_string();
        return Some((text, count));
    }
    None
}

pub fn parse_block_id(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if let Some(pos) = trimmed.rfind(" ^") {
        let candidate = &trimmed[pos + 2..];
        if candidate.chars().all(|c| c.is_alphanumeric() || c == '-') {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Updates references to `old_rel_path` in markdown content to `new_rel_path`.
/// Handles [[Note]], [[Note|Alias]], [[Note#Heading]], [[Note#^block]], ![[Note]],
/// and standard markdown links [label](path).
pub fn update_links_in_markdown(
    content: &str,
    old_rel_path: &str,
    new_rel_path: &str,
) -> (String, usize) {
    let old_stem = Path::new(old_rel_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(old_rel_path);
    let new_stem = Path::new(new_rel_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(new_rel_path);

    let old_no_ext = old_rel_path.strip_suffix(".md").unwrap_or(old_rel_path);
    let new_no_ext = new_rel_path.strip_suffix(".md").unwrap_or(new_rel_path);

    let mut result = String::with_capacity(content.len());
    let mut count = 0;
    let chars: Vec<char> = content.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if i + 1 < len && chars[i] == '[' && chars[i + 1] == '[' {
            // Find closing ]]
            let start = i + 2;
            let mut j = start;
            while j + 1 < len && !(chars[j] == ']' && chars[j + 1] == ']') {
                j += 1;
            }
            if j + 1 < len {
                let inner: String = chars[start..j].iter().collect();
                // Determine target and suffix (heading, block, alias)
                let (target_part, suffix_char, suffix_rest) = if let Some(idx) = inner.find(|c| c == '|' || c == '#' || c == '^') {
                    let c = inner.chars().nth(idx).unwrap();
                    (&inner[..idx], Some(c), &inner[idx + 1..])
                } else {
                    (inner.as_str(), None, "")
                };

                let target_trimmed = target_part.trim();
                let matches_stem = target_trimmed == old_stem;
                let matches_rel = target_trimmed == old_no_ext || target_trimmed == old_rel_path;

                if matches_stem || matches_rel {
                    count += 1;
                    result.push_str("[[");
                    let replacement_target = if matches_rel && target_trimmed.contains('/') {
                        new_no_ext
                    } else {
                        new_stem
                    };
                    result.push_str(replacement_target);
                    if let Some(c) = suffix_char {
                        result.push(c);
                        result.push_str(suffix_rest);
                    }
                    result.push_str("]]");
                    i = j + 2;
                    continue;
                }
            }
        }
        result.push(chars[i]);
        i += 1;
    }

    // Also check standard markdown links [label](path)
    let mut final_content = result;
    let old_variants = vec![
        old_rel_path.to_string(),
        old_rel_path.replace(' ', "%20"),
        format!("{}.md", old_stem),
        format!("{}.md", old_stem).replace(' ', "%20"),
    ];

    for old_v in old_variants {
        let pattern = format!("]({})", old_v);
        let replacement = format!("]({})", new_rel_path.replace(' ', "%20"));
        if final_content.contains(&pattern) {
            count += 1;
            final_content = final_content.replace(&pattern, &replacement);
        }
    }

    (final_content, count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_links_in_markdown() {
        let md = "Here is [[Old Note]] and [[Old Note|My Alias]] and [[Old Note#Header]] and ![[Old Note]] and [label](Old%20Note.md).";
        let (updated, count) = update_links_in_markdown(md, "Old Note.md", "New Note.md");
        assert_eq!(count, 5);
        assert_eq!(
            updated,
            "Here is [[New Note]] and [[New Note|My Alias]] and [[New Note#Header]] and ![[New Note]] and [label](New%20Note.md)."
        );
    }

    #[test]
    fn test_wikilinks_parser() {
        let line = "A link [[Target Note|Custom]] and ![[Embed Note#Heading]] here.";
        let links = parse_wikilinks(line);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target_note, "Target Note");
        assert_eq!(links[0].alias.as_deref(), Some("Custom"));
        assert!(!links[0].is_embed);

        assert_eq!(links[1].target_note, "Embed Note");
        assert_eq!(links[1].heading.as_deref(), Some("Heading"));
        assert!(links[1].is_embed);
    }

    #[test]
    fn test_inline_tags_parser() {
        let line = "Some notes with #tag and #nested/tag and #project-a and hex #FF0000.";
        let tags = parse_inline_tags(line);
        assert!(tags.contains(&"tag".to_string()));
        assert!(tags.contains(&"nested/tag".to_string()));
        assert!(tags.contains(&"project-a".to_string()));
        // #FF0000 should be ignored as hex
        assert!(!tags.contains(&"FF0000".to_string()));
    }
}
