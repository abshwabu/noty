// Diff3 text merge algorithm for markdown notes

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeResult {
    Clean(String),
    Conflict {
        merged_text: String,
        conflicts_count: usize,
    },
}

/// Three-way line-based merge
/// Given:
/// - `base`: original common ancestor version
/// - `local`: client A's version
/// - `remote`: client B's version
pub fn diff3_merge(base: &str, local: &str, remote: &str) -> MergeResult {
    if local == remote {
        return MergeResult::Clean(local.to_string());
    }
    if local == base {
        return MergeResult::Clean(remote.to_string());
    }
    if remote == base {
        return MergeResult::Clean(local.to_string());
    }

    let base_lines: Vec<&str> = base.lines().collect();
    let local_lines: Vec<&str> = local.lines().collect();
    let remote_lines: Vec<&str> = remote.lines().collect();

    // Fast check: If base is empty, both added content
    if base_lines.is_empty() {
        if local_lines == remote_lines {
            return MergeResult::Clean(local.to_string());
        }
        let mut text = String::new();
        text.push_str("<<<<<<< LOCAL\n");
        text.push_str(local);
        if !local.ends_with('\n') {
            text.push('\n');
        }
        text.push_str("=======\n");
        text.push_str(remote);
        if !remote.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(">>>>>>> REMOTE\n");
        return MergeResult::Conflict {
            merged_text: text,
            conflicts_count: 1,
        };
    }

    // Line-by-line diff tracking
    let mut merged = Vec::new();
    let mut conflicts = 0;

    let mut b_idx = 0;
    let mut l_idx = 0;
    let mut r_idx = 0;

    while b_idx < base_lines.len() || l_idx < local_lines.len() || r_idx < remote_lines.len() {
        // If all match
        if b_idx < base_lines.len()
            && l_idx < local_lines.len()
            && r_idx < remote_lines.len()
            && base_lines[b_idx] == local_lines[l_idx]
            && base_lines[b_idx] == remote_lines[r_idx]
        {
            merged.push(base_lines[b_idx].to_string());
            b_idx += 1;
            l_idx += 1;
            r_idx += 1;
            continue;
        }

        // Local change only (remote matches base)
        if b_idx < base_lines.len()
            && r_idx < remote_lines.len()
            && base_lines[b_idx] == remote_lines[r_idx]
        {
            // Find next sync point where local matches base
            if l_idx < local_lines.len() {
                merged.push(local_lines[l_idx].to_string());
                l_idx += 1;
                // If local replaced the base line
                if b_idx < base_lines.len() {
                    b_idx += 1;
                    r_idx += 1;
                }
            } else {
                // Local deleted base lines
                b_idx += 1;
                r_idx += 1;
            }
            continue;
        }

        // Remote change only (local matches base)
        if b_idx < base_lines.len()
            && l_idx < local_lines.len()
            && base_lines[b_idx] == local_lines[l_idx]
        {
            if r_idx < remote_lines.len() {
                merged.push(remote_lines[r_idx].to_string());
                r_idx += 1;
                if b_idx < base_lines.len() {
                    b_idx += 1;
                    l_idx += 1;
                }
            } else {
                b_idx += 1;
                l_idx += 1;
            }
            continue;
        }

        // Both changed: check if they changed identically
        if l_idx < local_lines.len()
            && r_idx < remote_lines.len()
            && local_lines[l_idx] == remote_lines[r_idx]
        {
            merged.push(local_lines[l_idx].to_string());
            l_idx += 1;
            r_idx += 1;
            if b_idx < base_lines.len() {
                b_idx += 1;
            }
            continue;
        }

        // True conflict: local and remote made divergent edits at this region
        conflicts += 1;
        let mut local_chunk = Vec::new();
        let mut remote_chunk = Vec::new();

        if l_idx < local_lines.len() {
            local_chunk.push(local_lines[l_idx]);
            l_idx += 1;
        }
        if r_idx < remote_lines.len() {
            remote_chunk.push(remote_lines[r_idx]);
            r_idx += 1;
        }
        if b_idx < base_lines.len() {
            b_idx += 1;
        }

        merged.push("<<<<<<< LOCAL".to_string());
        for line in local_chunk {
            merged.push(line.to_string());
        }
        merged.push("=======".to_string());
        for line in remote_chunk {
            merged.push(line.to_string());
        }
        merged.push(">>>>>>> REMOTE".to_string());
    }

    let mut result_str = merged.join("\n");
    if local.ends_with('\n') || remote.ends_with('\n') {
        result_str.push('\n');
    }

    if conflicts == 0 {
        MergeResult::Clean(result_str)
    } else {
        MergeResult::Conflict {
            merged_text: result_str,
            conflicts_count: conflicts,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_merge_no_conflict() {
        let base = "Line 1\nLine 2\nLine 3\n";
        let local = "Line 1 (modified)\nLine 2\nLine 3\n";
        let remote = "Line 1\nLine 2\nLine 3 (added remote)\n";

        match diff3_merge(base, local, remote) {
            MergeResult::Clean(merged) => {
                assert!(merged.contains("Line 1 (modified)"));
                assert!(merged.contains("Line 2"));
                assert!(merged.contains("Line 3 (added remote)"));
            }
            MergeResult::Conflict { .. } => panic!("expected clean merge"),
        }
    }

    #[test]
    fn test_conflict_detection() {
        let base = "Line 1\nLine 2\nLine 3\n";
        let local = "Line 1 (local edit)\nLine 2\nLine 3\n";
        let remote = "Line 1 (remote edit)\nLine 2\nLine 3\n";

        match diff3_merge(base, local, remote) {
            MergeResult::Clean(_) => panic!("expected conflict"),
            MergeResult::Conflict {
                merged_text,
                conflicts_count,
            } => {
                assert_eq!(conflicts_count, 1);
                assert!(merged_text.contains("<<<<<<< LOCAL"));
                assert!(merged_text.contains("Line 1 (local edit)"));
                assert!(merged_text.contains("======="));
                assert!(merged_text.contains("Line 1 (remote edit)"));
                assert!(merged_text.contains(">>>>>>> REMOTE"));
            }
        }
    }
}
