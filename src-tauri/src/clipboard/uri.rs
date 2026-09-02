use std::path::PathBuf;

/// Parses `text/uri-list` (and GNOME's variant of it) into local paths.
///
/// GNOME prefixes its list with an operation line (`copy` / `cut`), and both
/// formats percent-encode everything that is not URL-safe.
pub fn parse_uri_list(bytes: &[u8]) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    for line in bytes.split(|byte| *byte == b'\n') {
        let line = trim_ascii(line);
        if line.is_empty() || line.starts_with(b"#") {
            continue;
        }
        let Some(rest) = line.strip_prefix(b"file://") else {
            // The operation line and anything that is not a local file.
            continue;
        };
        // `file://host/path` -- drop the authority, keep the path.
        let path = match rest.iter().position(|byte| *byte == b'/') {
            Some(0) => rest,
            Some(slash) => &rest[slash..],
            None => continue,
        };
        let decoded = percent_decode(path);
        paths.push(PathBuf::from(String::from_utf8_lossy(&decoded).into_owned()));
    }

    paths
}

fn trim_ascii(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|byte| !byte.is_ascii_whitespace())
        .map_or(start, |index| index + 1);
    &bytes[start..end]
}

fn percent_decode(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .ok()
                .and_then(|pair| u8::from_str_radix(pair, 16).ok());
            if let Some(byte) = hex {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_paths_with_spaces_and_utf8() {
        let list = b"file:///tmp/my%20shot.png\r\nfile:///tmp/%D1%84%D0%B0%D0%B9%D0%BB.log\n";
        assert_eq!(
            parse_uri_list(list),
            vec![
                PathBuf::from("/tmp/my shot.png"),
                PathBuf::from("/tmp/файл.log"),
            ]
        );
    }

    #[test]
    fn skips_the_gnome_operation_line_and_comments() {
        let list = b"copy\n# comment\nfile:///tmp/a.txt\n";
        assert_eq!(parse_uri_list(list), vec![PathBuf::from("/tmp/a.txt")]);
    }

    #[test]
    fn drops_the_authority_of_file_urls() {
        let list = b"file://localhost/tmp/a.txt\n";
        assert_eq!(parse_uri_list(list), vec![PathBuf::from("/tmp/a.txt")]);
    }
}
