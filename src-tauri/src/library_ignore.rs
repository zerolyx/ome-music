use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const IGNORE_FILE_NAME: &str = ".foliaignore";
const MAX_IGNORE_FILE_BYTES: u64 = 1024 * 1024;
const MAX_IGNORE_LINE_CHARS: usize = 4096;
const MAX_IGNORE_RULES: usize = 10_000;

#[derive(Clone, Debug)]
pub(crate) struct IgnoreScope {
    base: PathBuf,
    rules: Vec<IgnoreRule>,
}

#[derive(Clone, Debug)]
struct IgnoreRule {
    pattern: Vec<char>,
    negated: bool,
    anchored: bool,
    directory_only: bool,
    contains_separator: bool,
}

/// Extend inherited directory rules with this directory's optional .foliaignore.
/// Missing files are normal; unreadable, oversized, or symlinked files are reported.
pub(crate) fn child_scopes(
    parent: &[Arc<IgnoreScope>],
    directory: &Path,
) -> io::Result<Vec<Arc<IgnoreScope>>> {
    let mut scopes = parent.to_vec();
    let path = directory.join(IGNORE_FILE_NAME);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(scopes),
        Err(error) => return Err(error),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ignore rules must be a regular file",
        ));
    }
    if metadata.len() > MAX_IGNORE_FILE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ignore rules file is too large",
        ));
    }

    let bytes = fs::read(path)?;
    let text = String::from_utf8_lossy(&bytes);
    if text.lines().count() > MAX_IGNORE_RULES
        || text
            .lines()
            .any(|line| line.chars().count() > MAX_IGNORE_LINE_CHARS)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ignore rules file exceeds its limits",
        ));
    }
    let rules = parse_rules(&text);
    if !rules.is_empty() {
        scopes.push(Arc::new(IgnoreScope {
            base: directory.to_path_buf(),
            rules,
        }));
    }
    Ok(scopes)
}

/// Evaluate inherited rules from the root toward the current directory. Later rules,
/// including rules in nested files, override earlier matches.
pub(crate) fn is_ignored(scopes: &[Arc<IgnoreScope>], path: &Path, is_directory: bool) -> bool {
    let mut ignored = false;
    for scope in scopes {
        let Ok(relative) = path.strip_prefix(&scope.base) else {
            continue;
        };
        let relative = relative.to_string_lossy().replace('\\', "/");
        let path: Vec<char> = relative.chars().collect();
        let components: Vec<Vec<char>> = relative
            .split('/')
            .map(|component| component.chars().collect())
            .collect();
        for rule in &scope.rules {
            if rule_matches(rule, &path, &components, is_directory) {
                ignored = !rule.negated;
            }
        }
    }
    ignored
}

fn parse_rules(text: &str) -> Vec<IgnoreRule> {
    text.strip_prefix('\u{feff}')
        .unwrap_or(text)
        .lines()
        .filter_map(|raw| {
            let line = trim_unescaped_trailing_spaces(raw.trim_end_matches('\r'));
            let line = line.trim_start();
            if line.is_empty() || (line.starts_with('#') && !line.starts_with(r"\#")) {
                return None;
            }

            let (negated, pattern) = if line.starts_with(r"\!") {
                (false, line)
            } else if let Some(pattern) = line.strip_prefix('!') {
                (true, pattern)
            } else {
                (false, line)
            };
            let anchored = pattern.starts_with('/');
            let pattern = pattern.strip_prefix('/').unwrap_or(pattern);
            let directory_only = pattern.ends_with('/');
            let pattern = pattern.strip_suffix('/').unwrap_or(pattern);
            if pattern.is_empty() {
                return None;
            }

            let pattern: Vec<char> = pattern.chars().collect();
            Some(IgnoreRule {
                contains_separator: pattern.contains(&'/'),
                pattern,
                negated,
                anchored,
                directory_only,
            })
        })
        .collect()
}

fn trim_unescaped_trailing_spaces(line: &str) -> String {
    let mut chars: Vec<char> = line.chars().collect();
    while chars.last() == Some(&' ') {
        let mut slashes = 0;
        for character in chars[..chars.len() - 1].iter().rev() {
            if *character != '\\' {
                break;
            }
            slashes += 1;
        }
        if slashes % 2 == 1 {
            break;
        }
        chars.pop();
    }
    chars.into_iter().collect()
}

fn rule_matches(
    rule: &IgnoreRule,
    path: &[char],
    components: &[Vec<char>],
    is_directory: bool,
) -> bool {
    if rule.directory_only && !is_directory {
        return false;
    }
    if !rule.anchored && !rule.contains_separator {
        return components
            .last()
            .is_some_and(|component| glob_matches(&rule.pattern, component));
    }
    glob_matches(&rule.pattern, path)
}

fn glob_matches(pattern: &[char], text: &[char]) -> bool {
    fn visit(
        pattern: &[char],
        text: &[char],
        pattern_index: usize,
        text_index: usize,
        memo: &mut HashMap<(usize, usize), bool>,
    ) -> bool {
        if let Some(result) = memo.get(&(pattern_index, text_index)) {
            return *result;
        }
        let result = if pattern_index == pattern.len() {
            text_index == text.len()
        } else {
            match pattern[pattern_index] {
                '*' if pattern.get(pattern_index + 1) == Some(&'*') => {
                    let after_stars = pattern_index + 2;
                    if pattern.get(after_stars) == Some(&'/') {
                        visit(pattern, text, after_stars + 1, text_index, memo)
                            || (text_index..text.len()).any(|index| {
                                text[index] == '/'
                                    && visit(pattern, text, after_stars + 1, index + 1, memo)
                            })
                    } else {
                        (text_index..=text.len())
                            .any(|index| visit(pattern, text, after_stars, index, memo))
                    }
                }
                '*' => {
                    visit(pattern, text, pattern_index + 1, text_index, memo)
                        || (text_index < text.len()
                            && text[text_index] != '/'
                            && visit(pattern, text, pattern_index, text_index + 1, memo))
                }
                '[' => {
                    let closing = pattern[pattern_index + 1..]
                        .iter()
                        .position(|character| *character == ']')
                        .map(|offset| pattern_index + 1 + offset);
                    if let Some(closing) = closing.filter(|closing| *closing > pattern_index + 1) {
                        text_index < text.len()
                            && text[text_index] != '/'
                            && character_class_matches(
                                &pattern[pattern_index + 1..closing],
                                text[text_index],
                            )
                            && visit(pattern, text, closing + 1, text_index + 1, memo)
                    } else {
                        text_index < text.len()
                            && text[text_index] == '['
                            && visit(pattern, text, pattern_index + 1, text_index + 1, memo)
                    }
                }
                '?' => {
                    text_index < text.len()
                        && text[text_index] != '/'
                        && visit(pattern, text, pattern_index + 1, text_index + 1, memo)
                }
                '\\' if pattern_index + 1 < pattern.len() => {
                    text_index < text.len()
                        && pattern[pattern_index + 1] == text[text_index]
                        && visit(pattern, text, pattern_index + 2, text_index + 1, memo)
                }
                literal => {
                    text_index < text.len()
                        && literal == text[text_index]
                        && visit(pattern, text, pattern_index + 1, text_index + 1, memo)
                }
            }
        };
        memo.insert((pattern_index, text_index), result);
        result
    }

    visit(pattern, text, 0, 0, &mut HashMap::new())
}

fn character_class_matches(class: &[char], candidate: char) -> bool {
    let (negated, class) = if class.first() == Some(&'!') {
        (true, &class[1..])
    } else {
        (false, class)
    };
    let mut matched = false;
    let mut index = 0;
    while index < class.len() {
        if index + 2 < class.len() && class[index + 1] == '-' {
            matched |= class[index] <= candidate && candidate <= class[index + 2];
            index += 3;
        } else {
            matched |= class[index] == candidate;
            index += 1;
        }
    }
    if negated {
        !matched
    } else {
        matched
    }
}

#[cfg(test)]
mod tests {
    use super::{child_scopes, is_ignored, parse_rules, IgnoreScope};
    use std::path::{Path, PathBuf};
    use std::sync::Arc;

    fn scope(base: &Path, rules: &str) -> Arc<IgnoreScope> {
        Arc::new(IgnoreScope {
            base: base.to_path_buf(),
            rules: parse_rules(rules),
        })
    }

    #[test]
    fn parses_comments_wildcards_rooted_paths_and_directory_rules() {
        let root = PathBuf::from("C:/Music");
        let scopes = [scope(&root, "# comment\n*.tmp.mp3\n/private.mp3\ncache/\n")];
        assert!(is_ignored(&scopes, &root.join("draft.tmp.mp3"), false));
        assert!(is_ignored(&scopes, &root.join("live/draft.tmp.mp3"), false));
        assert!(is_ignored(&scopes, &root.join("private.mp3"), false));
        assert!(!is_ignored(&scopes, &root.join("sub/private.mp3"), false));
        assert!(is_ignored(&scopes, &root.join("sub/cache"), true));
        assert!(!is_ignored(&scopes, &root.join("cache"), false));
    }

    #[test]
    fn later_and_nested_negative_rules_override_parent_matches() {
        let root = PathBuf::from("C:/Music");
        let child = root.join("live");
        let scopes = [
            scope(&root, "*.mp3\n!keep.mp3\n"),
            scope(&child, "!favorite.mp3\n"),
        ];
        assert!(is_ignored(&scopes, &root.join("live/other.mp3"), false));
        assert!(!is_ignored(&scopes, &root.join("live/keep.mp3"), false));
        assert!(!is_ignored(&scopes, &child.join("favorite.mp3"), false));
    }

    #[test]
    fn directory_must_be_reincluded_before_its_children_can_be_scanned() {
        let root = PathBuf::from("C:/Music");
        let ignored_directory = root.join("cache");
        let scopes = [scope(&root, "cache/\n!cache/\n")];
        assert!(!is_ignored(&scopes, &ignored_directory, true));
        assert!(!is_ignored(
            &scopes,
            &ignored_directory.join("keep.flac"),
            false
        ));
    }

    #[test]
    fn double_star_spans_directories_and_question_mark_matches_one_character() {
        let root = PathBuf::from("C:/Music");
        let scopes = [scope(&root, "archive/**/draft?.flac\n")];
        assert!(is_ignored(
            &scopes,
            &root.join("archive/draft1.flac"),
            false
        ));
        assert!(is_ignored(
            &scopes,
            &root.join("archive/old/draftA.flac"),
            false
        ));
        assert!(!is_ignored(&scopes, &root.join("other/draft1.flac"), false));
        assert!(!is_ignored(
            &scopes,
            &root.join("archive/draft12.flac"),
            false
        ));
    }

    #[test]
    fn supports_character_classes_and_ranges() {
        let root = PathBuf::from("C:/Music");
        let scopes = [scope(&root, "[0-9]track.flac\n[!x]demo.mp3\n")];
        assert!(is_ignored(&scopes, &root.join("4track.flac"), false));
        assert!(!is_ignored(&scopes, &root.join("atrack.flac"), false));
        assert!(is_ignored(&scopes, &root.join("ademo.mp3"), false));
        assert!(!is_ignored(&scopes, &root.join("xdemo.mp3"), false));
    }

    #[test]
    fn escaped_comment_and_negation_prefixes_are_literal_names() {
        let root = PathBuf::from("C:/Music");
        let scopes = [scope(&root, "\\#notes.mp3\n\\!demo.mp3\n")];
        assert!(is_ignored(&scopes, &root.join("#notes.mp3"), false));
        assert!(is_ignored(&scopes, &root.join("!demo.mp3"), false));
    }

    #[test]
    fn nested_ignore_file_is_scoped_to_its_directory() {
        let root = std::env::temp_dir().join(format!("ome-ignore-test-{}", std::process::id()));
        let child = root.join("live");
        std::fs::create_dir_all(&child).unwrap();
        std::fs::write(child.join(".foliaignore"), "\u{feff}*.wav\n").unwrap();
        let parent_scopes = child_scopes(&[], &root).unwrap();
        let scopes = child_scopes(&parent_scopes, &child).unwrap();
        assert!(is_ignored(&scopes, &child.join("demo.wav"), false));
        assert!(!is_ignored(&scopes, &root.join("demo.wav"), false));
        let _ = std::fs::remove_dir_all(root);
    }
}
