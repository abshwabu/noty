use regex::Regex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatchItem {
    pub line_number: usize,
    pub line_text: String,
    pub match_start: usize,
    pub match_end: usize,
    pub before_context: Vec<String>,
    pub after_context: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSearchResult {
    pub file_path: String,
    pub file_title: String,
    pub modified_at: u64,
    pub matches: Vec<SearchMatchItem>,
    pub total_matches: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<FileSearchResult>,
    pub total_files: usize,
    pub total_matches: usize,
    pub duration_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub regex: bool,
    pub sort_by: Option<String>,
    pub more_context: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacePreviewItem {
    pub file_path: String,
    pub line_number: usize,
    pub original_line: String,
    pub replaced_line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalReplaceRequest {
    pub search_query: String,
    pub replacement: String,
    pub case_sensitive: bool,
    pub regex: bool,
    pub target_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalReplaceResult {
    pub files_modified: usize,
    pub occurrences_replaced: usize,
}

#[derive(Debug, Clone)]
pub enum QueryOperator {
    Path(String, bool),               // path:folder (value, is_negated)
    File(String, bool),               // file:name
    Tag(String, bool),                // tag:project or #project
    TaskTodo(String, bool),           // task-todo:text
    TaskDone(String, bool),           // task-done:text
    Property(String, Option<String>, bool), // [prop:val] or [prop]
    Section(String, bool),            // section:header
    Line(String, bool),               // line:(term)
    Regex(String, bool),              // /regex/
    ExactPhrase(String, bool),        // "exact phrase"
    Content(String, bool),            // content:term
    Plain(String, bool),              // plain word
}

/// Parses an Obsidian search query string into structured operators
pub fn parse_search_query(query: &str) -> Vec<Vec<QueryOperator>> {
    let or_branches: Vec<&str> = query.split(" OR ").collect();
    let mut parsed_branches = Vec::new();

    for branch in or_branches {
        let mut ops = Vec::new();
        let trimmed_branch = branch.trim();
        if trimmed_branch.is_empty() {
            continue;
        }

        let tokens = tokenize_query_branch(trimmed_branch);
        for token in tokens {
            if let Some(op) = parse_single_operator(&token) {
                ops.push(op);
            }
        }

        if !ops.is_empty() {
            parsed_branches.push(ops);
        }
    }

    if parsed_branches.is_empty() && !query.trim().is_empty() {
        parsed_branches.push(vec![QueryOperator::Plain(query.trim().to_string(), false)]);
    }

    parsed_branches
}

fn tokenize_query_branch(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }

        // Quoted phrase "..."
        if chars[i] == '"' || (chars[i] == '-' && i + 1 < len && chars[i + 1] == '"') {
            let is_neg = chars[i] == '-';
            let start = if is_neg { i + 2 } else { i + 1 };
            let mut j = start;
            while j < len && chars[j] != '"' {
                j += 1;
            }
            let phrase: String = chars[start..j].iter().collect();
            tokens.push(if is_neg { format!("-\"{}\"", phrase) } else { format!("\"{}\"", phrase) });
            i = if j < len { j + 1 } else { j };
            continue;
        }

        // Regex /.../
        if chars[i] == '/' || (chars[i] == '-' && i + 1 < len && chars[i + 1] == '/') {
            let is_neg = chars[i] == '-';
            let start = if is_neg { i + 2 } else { i + 1 };
            let mut j = start;
            while j < len && chars[j] != '/' {
                j += 1;
            }
            let reg: String = chars[start..j].iter().collect();
            tokens.push(if is_neg { format!("-/{}/", reg) } else { format!("/{}/", reg) });
            i = if j < len { j + 1 } else { j };
            continue;
        }

        // Property bracket [...]
        if chars[i] == '[' || (chars[i] == '-' && i + 1 < len && chars[i + 1] == '[') {
            let is_neg = chars[i] == '-';
            let start = if is_neg { i + 2 } else { i + 1 };
            let mut j = start;
            while j < len && chars[j] != ']' {
                j += 1;
            }
            let prop: String = chars[start..j].iter().collect();
            tokens.push(if is_neg { format!("-[{}]", prop) } else { format!("[{}]", prop) });
            i = if j < len { j + 1 } else { j };
            continue;
        }

        // Normal word or prefix:value
        let start = i;
        while i < len && !chars[i].is_whitespace() {
            i += 1;
        }
        let word: String = chars[start..i].iter().collect();
        tokens.push(word);
    }

    tokens
}

fn parse_single_operator(token: &str) -> Option<QueryOperator> {
    let is_neg = token.starts_with('-');
    let raw = if is_neg { &token[1..] } else { token };

    if raw.is_empty() {
        return None;
    }

    // "exact phrase"
    if raw.starts_with('"') && raw.ends_with('"') && raw.len() >= 2 {
        let inner = &raw[1..raw.len() - 1];
        return Some(QueryOperator::ExactPhrase(inner.to_string(), is_neg));
    }

    // /regex/
    if raw.starts_with('/') && raw.ends_with('/') && raw.len() >= 2 {
        let inner = &raw[1..raw.len() - 1];
        return Some(QueryOperator::Regex(inner.to_string(), is_neg));
    }

    // [property:value] or [property]
    if raw.starts_with('[') && raw.ends_with(']') && raw.len() >= 2 {
        let inner = &raw[1..raw.len() - 1];
        if let Some((k, v)) = inner.split_once(':') {
            return Some(QueryOperator::Property(k.trim().to_string(), Some(v.trim().to_string()), is_neg));
        } else {
            return Some(QueryOperator::Property(inner.trim().to_string(), None, is_neg));
        }
    }

    // tag: or #tag
    if let Some(rest) = raw.strip_prefix("tag:") {
        return Some(QueryOperator::Tag(rest.trim().trim_start_matches('#').to_string(), is_neg));
    }
    if raw.starts_with('#') && raw.len() > 1 && !raw.chars().skip(1).all(|c| c.is_ascii_hexdigit()) {
        return Some(QueryOperator::Tag(raw[1..].to_string(), is_neg));
    }

    // path:
    if let Some(rest) = raw.strip_prefix("path:") {
        return Some(QueryOperator::Path(rest.trim().to_string(), is_neg));
    }

    // file:
    if let Some(rest) = raw.strip_prefix("file:") {
        return Some(QueryOperator::File(rest.trim().to_string(), is_neg));
    }

    // task-todo:
    if let Some(rest) = raw.strip_prefix("task-todo:") {
        return Some(QueryOperator::TaskTodo(rest.trim().to_string(), is_neg));
    }

    // task-done:
    if let Some(rest) = raw.strip_prefix("task-done:") {
        return Some(QueryOperator::TaskDone(rest.trim().to_string(), is_neg));
    }

    // section:
    if let Some(rest) = raw.strip_prefix("section:") {
        return Some(QueryOperator::Section(rest.trim().to_string(), is_neg));
    }

    // line:
    if let Some(rest) = raw.strip_prefix("line:") {
        let cleaned = rest.trim().trim_start_matches('(').trim_end_matches(')');
        return Some(QueryOperator::Line(cleaned.to_string(), is_neg));
    }

    // content:
    if let Some(rest) = raw.strip_prefix("content:") {
        return Some(QueryOperator::Content(rest.trim().to_string(), is_neg));
    }

    // Plain word
    Some(QueryOperator::Plain(raw.to_string(), is_neg))
}

/// Executes full-text and operator search against the SQLite database and vault files
pub fn execute_search(
    conn: &Connection,
    vault_path: &Path,
    raw_query: &str,
    options: &SearchOptions,
) -> Result<SearchResponse, String> {
    let start_time = Instant::now();
    let query_branches = parse_search_query(raw_query);

    let mut matched_files: HashMap<String, (String, u64)> = HashMap::new();

    // Fetch all files from DB
    let mut file_stmt = conn
        .prepare("SELECT path, mtime FROM files")
        .map_err(|e| e.to_string())?;

    let all_db_files: Vec<(String, u64)> = file_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get::<_, i64>(1)? as u64)))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    // Pre-cache tags map, tasks map, headings map for fast lookups
    let mut tags_by_file: HashMap<String, HashSet<String>> = HashMap::new();
    let mut tag_stmt = conn.prepare("SELECT file_path, tag FROM tags").map_err(|e| e.to_string())?;
    let tag_rows = tag_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    for r in tag_rows.flatten() {
        tags_by_file.entry(r.0).or_default().insert(r.1.to_lowercase());
    }

    let mut tasks_by_file: HashMap<String, Vec<(String, bool)>> = HashMap::new();
    let mut task_stmt = conn.prepare("SELECT file_path, task_text, completed FROM tasks").map_err(|e| e.to_string())?;
    let task_rows = task_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)? != 0))
    }).map_err(|e| e.to_string())?;
    for r in task_rows.flatten() {
        tasks_by_file.entry(r.0).or_default().push((r.1, r.2));
    }

    let mut props_by_file: HashMap<String, Vec<(String, String)>> = HashMap::new();
    let mut prop_stmt = conn.prepare("SELECT file_path, key, value_json FROM properties").map_err(|e| e.to_string())?;
    let prop_rows = prop_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?;
    for r in prop_rows.flatten() {
        props_by_file.entry(r.0).or_default().push((r.1.to_lowercase(), r.2.to_lowercase()));
    }

    let mut headings_by_file: HashMap<String, Vec<String>> = HashMap::new();
    let mut heading_stmt = conn.prepare("SELECT file_path, heading_text FROM headings").map_err(|e| e.to_string())?;
    let heading_rows = heading_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;
    for r in heading_rows.flatten() {
        headings_by_file.entry(r.0).or_default().push(r.1);
    }

    // Evaluate OR branches
    for branch in &query_branches {
        for (path, mtime) in &all_db_files {
            let title = Path::new(path).file_stem().and_then(|s| s.to_str()).unwrap_or(path).to_string();
            let mut branch_matches = true;

            for op in branch {
                let matches_op = match op {
                    QueryOperator::Path(val, neg) => {
                        let ok = path.to_lowercase().contains(&val.to_lowercase());
                        if *neg { !ok } else { ok }
                    }
                    QueryOperator::File(val, neg) => {
                        let ok = title.to_lowercase().contains(&val.to_lowercase());
                        if *neg { !ok } else { ok }
                    }
                    QueryOperator::Tag(val, neg) => {
                        let val_lower = val.to_lowercase();
                        let ok = tags_by_file.get(path).map(|set| {
                            set.iter().any(|t| t == &val_lower || t.starts_with(&format!("{}/", val_lower)))
                        }).unwrap_or(false);
                        if *neg { !ok } else { ok }
                    }
                    QueryOperator::TaskTodo(val, neg) => {
                        let val_lower = val.to_lowercase();
                        let ok = tasks_by_file.get(path).map(|tasks| {
                            tasks.iter().any(|(t, comp)| !comp && (val_lower.is_empty() || t.to_lowercase().contains(&val_lower)))
                        }).unwrap_or(false);
                        if *neg { !ok } else { ok }
                    }
                    QueryOperator::TaskDone(val, neg) => {
                        let val_lower = val.to_lowercase();
                        let ok = tasks_by_file.get(path).map(|tasks| {
                            tasks.iter().any(|(t, comp)| *comp && (val_lower.is_empty() || t.to_lowercase().contains(&val_lower)))
                        }).unwrap_or(false);
                        if *neg { !ok } else { ok }
                    }
                    QueryOperator::Property(key, val, neg) => {
                        let key_lower = key.to_lowercase();
                        let ok = props_by_file.get(path).map(|props| {
                            props.iter().any(|(k, v)| {
                                if k != &key_lower {
                                    return false;
                                }
                                if let Some(target_val) = val {
                                    v.contains(&target_val.to_lowercase())
                                } else {
                                    true
                                }
                            })
                        }).unwrap_or(false);
                        if *neg { !ok } else { ok }
                    }
                    QueryOperator::Section(val, neg) => {
                        let val_lower = val.to_lowercase();
                        let ok = headings_by_file.get(path).map(|headings| {
                            headings.iter().any(|h| h.to_lowercase().contains(&val_lower))
                        }).unwrap_or(false);
                        if *neg { !ok } else { ok }
                    }
                    _ => true, // Content / plain / regex / exact phrase checked during line snippet scanning
                };

                if !matches_op {
                    branch_matches = false;
                    break;
                }
            }

            if branch_matches {
                matched_files.insert(path.clone(), (title, *mtime));
            }
        }
    }

    // Now scan lines for content, regex, exact phrase, line: matching and snippet extraction
    let mut results = Vec::new();
    let mut total_matches_count = 0;

    for (file_path, (file_title, modified_at)) in matched_files {
        let full_path = vault_path.join(&file_path);
        let content = match fs::read_to_string(&full_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let lines: Vec<&str> = content.lines().collect();
        let mut matches = Vec::new();

        for (idx, line_str) in lines.iter().enumerate() {
            let line_num = idx + 1;

            for branch in &query_branches {
                for op in branch {
                    let mut found_range: Option<(usize, usize)> = None;

                    match op {
                        QueryOperator::Plain(word, neg) | QueryOperator::Content(word, neg) => {
                            if !*neg {
                                if options.regex {
                                    if let Ok(re) = Regex::new(word) {
                                        if let Some(m) = re.find(line_str) {
                                            found_range = Some((m.start(), m.end()));
                                        }
                                    }
                                } else if options.case_sensitive {
                                    if let Some(pos) = line_str.find(word) {
                                        found_range = Some((pos, pos + word.len()));
                                    }
                                } else {
                                    let lower_line = line_str.to_lowercase();
                                    let lower_word = word.to_lowercase();
                                    if let Some(pos) = lower_line.find(&lower_word) {
                                        found_range = Some((pos, pos + word.len()));
                                    }
                                }
                            }
                        }
                        QueryOperator::ExactPhrase(phrase, neg) => {
                            if !*neg {
                                if options.case_sensitive {
                                    if let Some(pos) = line_str.find(phrase) {
                                        found_range = Some((pos, pos + phrase.len()));
                                    }
                                } else {
                                    let lower_line = line_str.to_lowercase();
                                    let lower_phrase = phrase.to_lowercase();
                                    if let Some(pos) = lower_line.find(&lower_phrase) {
                                        found_range = Some((pos, pos + phrase.len()));
                                    }
                                }
                            }
                        }
                        QueryOperator::Regex(pattern, neg) => {
                            if !*neg {
                                if let Ok(re) = Regex::new(pattern) {
                                    if let Some(m) = re.find(line_str) {
                                        found_range = Some((m.start(), m.end()));
                                    }
                                }
                            }
                        }
                        QueryOperator::Line(term, neg) => {
                            if !*neg && line_str.to_lowercase().contains(&term.to_lowercase()) {
                                found_range = Some((0, line_str.len()));
                            }
                        }
                        _ => {}
                    }

                    if let Some((start, end)) = found_range {
                        let before_context = if options.more_context {
                            lines
                                .iter()
                                .skip(idx.saturating_sub(2))
                                .take(idx.saturating_sub(idx.saturating_sub(2)))
                                .map(|l| l.to_string())
                                .collect()
                        } else {
                            Vec::new()
                        };

                        let after_context = if options.more_context {
                            lines
                                .iter()
                                .skip(idx + 1)
                                .take(2)
                                .map(|l| l.to_string())
                                .collect()
                        } else {
                            Vec::new()
                        };

                        matches.push(SearchMatchItem {
                            line_number: line_num,
                            line_text: line_str.to_string(),
                            match_start: start,
                            match_end: end,
                            before_context,
                            after_context,
                        });
                        break;
                    }
                }
            }
        }

        let has_content_req = query_branches.iter().any(|b| {
            b.iter().any(|op| {
                matches!(
                    op,
                    QueryOperator::Plain(_, false)
                        | QueryOperator::Content(_, false)
                        | QueryOperator::ExactPhrase(_, false)
                        | QueryOperator::Regex(_, false)
                        | QueryOperator::Line(_, false)
                )
            })
        });

        if matches.is_empty() {
            if has_content_req {
                continue; // Content requirement was not satisfied in this file
            }

            // Find most representative line for the match
            let mut fallback_line_idx = 0;
            for branch in &query_branches {
                for op in branch {
                    match op {
                        QueryOperator::Tag(val, _) => {
                            if let Some(pos) = lines.iter().position(|l| l.to_lowercase().contains(&val.to_lowercase())) {
                                fallback_line_idx = pos;
                                break;
                            }
                        }
                        QueryOperator::TaskTodo(val, _) => {
                            if let Some(pos) = lines.iter().position(|l| l.trim().starts_with("- [ ]") && (val.is_empty() || l.to_lowercase().contains(&val.to_lowercase()))) {
                                fallback_line_idx = pos;
                                break;
                            }
                        }
                        QueryOperator::TaskDone(val, _) => {
                            if let Some(pos) = lines.iter().position(|l| (l.trim().starts_with("- [x]") || l.trim().starts_with("- [X]")) && (val.is_empty() || l.to_lowercase().contains(&val.to_lowercase()))) {
                                fallback_line_idx = pos;
                                break;
                            }
                        }
                        QueryOperator::Section(val, _) => {
                            if let Some(pos) = lines.iter().position(|l| l.starts_with('#') && l.to_lowercase().contains(&val.to_lowercase())) {
                                fallback_line_idx = pos;
                                break;
                            }
                        }
                        _ => {}
                    }
                }
            }

            let fallback_text = lines.get(fallback_line_idx).unwrap_or(&"").trim().to_string();
            matches.push(SearchMatchItem {
                line_number: fallback_line_idx + 1,
                line_text: if fallback_text.is_empty() { file_title.clone() } else { fallback_text },
                match_start: 0,
                match_end: 0,
                before_context: Vec::new(),
                after_context: Vec::new(),
            });
        }

        let total_matches = matches.len();
        total_matches_count += total_matches;
        results.push(FileSearchResult {
            file_path,
            file_title,
            modified_at,
            matches,
            total_matches,
        });
    }

    // Sort results
    let sort_mode = options.sort_by.as_deref().unwrap_or("matches-desc");
    match sort_mode {
        "matches-desc" => results.sort_by(|a, b| b.total_matches.cmp(&a.total_matches).then_with(|| a.file_title.cmp(&b.file_title))),
        "mtime-desc" => results.sort_by(|a, b| b.modified_at.cmp(&a.modified_at)),
        "mtime-asc" => results.sort_by(|a, b| a.modified_at.cmp(&b.modified_at)),
        "name-asc" => results.sort_by(|a, b| a.file_title.to_lowercase().cmp(&b.file_title.to_lowercase())),
        "name-desc" => results.sort_by(|a, b| b.file_title.to_lowercase().cmp(&a.file_title.to_lowercase())),
        _ => results.sort_by(|a, b| b.total_matches.cmp(&a.total_matches)),
    }

    let duration_ms = start_time.elapsed().as_secs_f64() * 1000.0;
    let total_files = results.len();

    Ok(SearchResponse {
        results,
        total_files,
        total_matches: total_matches_count,
        duration_ms,
    })
}

/// Generates a diff preview of what global replace will change before executing
pub fn preview_global_replace(
    vault_path: &Path,
    request: &GlobalReplaceRequest,
) -> Result<Vec<ReplacePreviewItem>, String> {
    if request.search_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut previews = Vec::new();
    let regex_matcher = if request.regex {
        Some(Regex::new(&request.search_query).map_err(|e| format!("Invalid regex: {}", e))?)
    } else {
        None
    };

    fn visit_dir(
        dir: &Path,
        vault_root: &Path,
        req: &GlobalReplaceRequest,
        re: &Option<Regex>,
        previews: &mut Vec<ReplacePreviewItem>,
    ) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with('.') {
                    continue;
                }
                if path.is_dir() {
                    visit_dir(&path, vault_root, req, re, previews);
                } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                    let rel = path
                        .strip_prefix(vault_root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");

                    if let Some(targets) = &req.target_paths {
                        if !targets.contains(&rel) {
                            continue;
                        }
                    }

                    if let Ok(content) = fs::read_to_string(&path) {
                        for (idx, line) in content.lines().enumerate() {
                            let line_num = idx + 1;
                            let replaced_opt = if let Some(regex) = re {
                                if regex.is_match(line) {
                                    Some(regex.replace_all(line, req.replacement.as_str()).to_string())
                                } else {
                                    None
                                }
                            } else if req.case_sensitive {
                                if line.contains(&req.search_query) {
                                    Some(line.replace(&req.search_query, &req.replacement))
                                } else {
                                    None
                                }
                            } else {
                                let lower_line = line.to_lowercase();
                                let lower_search = req.search_query.to_lowercase();
                                if lower_line.contains(&lower_search) {
                                    // Case-insensitive replace preserving casing when practical or replacing match
                                    if let Ok(re_ci) = Regex::new(&format!("(?i){}", regex::escape(&req.search_query))) {
                                        Some(re_ci.replace_all(line, req.replacement.as_str()).to_string())
                                    } else {
                                        Some(line.replace(&req.search_query, &req.replacement))
                                    }
                                } else {
                                    None
                                }
                            };

                            if let Some(replaced) = replaced_opt {
                                if replaced != line {
                                    previews.push(ReplacePreviewItem {
                                        file_path: rel.clone(),
                                        line_number: line_num,
                                        original_line: line.to_string(),
                                        replaced_line: replaced,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    visit_dir(vault_path, vault_path, request, &regex_matcher, &mut previews);
    Ok(previews)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_query_operators() {
        let query = "path:Work tag:project/tauri -file:Old \"exact phrase\" /abc\\d+/ [status:active] task-todo:fix";
        let branches = parse_search_query(query);
        assert_eq!(branches.len(), 1);
        let ops = &branches[0];

        assert!(ops.iter().any(|op| matches!(op, QueryOperator::Path(p, false) if p == "Work")));
        assert!(ops.iter().any(|op| matches!(op, QueryOperator::Tag(t, false) if t == "project/tauri")));
        assert!(ops.iter().any(|op| matches!(op, QueryOperator::File(f, true) if f == "Old")));
        assert!(ops.iter().any(|op| matches!(op, QueryOperator::ExactPhrase(p, false) if p == "exact phrase")));
        assert!(ops.iter().any(|op| matches!(op, QueryOperator::Regex(r, false) if r == "abc\\d+")));
        assert!(ops.iter().any(|op| matches!(op, QueryOperator::Property(k, Some(v), false) if k == "status" && v == "active")));
        assert!(ops.iter().any(|op| matches!(op, QueryOperator::TaskTodo(t, false) if t == "fix")));
    }

    #[test]
    fn test_parse_search_query_or() {
        let query = "tag:rust OR tag:tauri";
        let branches = parse_search_query(query);
        assert_eq!(branches.len(), 2);
    }
}
