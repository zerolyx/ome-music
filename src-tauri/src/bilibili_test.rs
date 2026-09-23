//! 纯逻辑单测：id 解析 / 时长 / 标题清洗 / WBI / 弹幕 XML。

use super::*;

#[test]
fn bilibili_song_id_parts_parses_prefixed_id() {
    let (bvid, page) = bilibili_song_id_parts("bilibili-BV1xx411c7mD");
    assert_eq!(bvid, "BV1xx411c7mD");
    assert_eq!(page, None);
}

#[test]
fn bilibili_song_id_parts_parses_page_suffix() {
    let (bvid, page) = bilibili_song_id_parts("bilibili-BV1xx411c7mD_3");
    assert_eq!(bvid, "BV1xx411c7mD");
    assert_eq!(page, Some(3));
}

#[test]
fn bilibili_song_id_parts_tolerates_bare_and_legacy_ids() {
    assert_eq!(bilibili_song_id_parts("BV1xx411c7mD").0, "BV1xx411c7mD");
    assert_eq!(bilibili_song_id_parts("av170001").0, "av170001");
    // 页码 0 / 非数字后缀不视为分 P。
    assert_eq!(bilibili_song_id_parts("bilibili-BV1xx411c7mD_0").1, None);
    assert_eq!(bilibili_song_id_parts("bilibili-BV1xx411c7mD_x").1, None);
}

#[test]
fn parse_duration_string_and_number() {
    assert_eq!(
        parse_bilibili_duration(Some(&serde_json::json!("5:30"))),
        Some(330)
    );
    assert_eq!(
        parse_bilibili_duration(Some(&serde_json::json!("1:02:03"))),
        Some(3723)
    );
    assert_eq!(
        parse_bilibili_duration(Some(&serde_json::json!(200))),
        Some(200)
    );
    assert_eq!(
        parse_bilibili_duration(Some(&serde_json::json!("bad"))),
        None
    );
    assert_eq!(parse_bilibili_duration(None), None);
}

#[test]
fn clean_title_strips_em_tags_and_entities() {
    assert_eq!(
        clean_bilibili_title("<em class=\"keyword\">晴天</em> &amp; 蓝天 &quot;Live&quot;"),
        "晴天 & 蓝天 \"Live\""
    );
}

#[test]
fn normalize_cover_url_upgrades_to_https() {
    assert_eq!(
        normalize_bilibili_image_url("http://i0.hdslb.com/bfs/a.jpg".to_string()),
        "https://i0.hdslb.com/bfs/a.jpg"
    );
    assert_eq!(
        normalize_bilibili_image_url("//i0.hdslb.com/bfs/a.jpg".to_string()),
        "https://i0.hdslb.com/bfs/a.jpg"
    );
}

#[test]
fn mixin_key_is_first_32_permuted_chars() {
    // 64 字符原始键（真实 nav 返回为 hex，这里用规律串验证置换逻辑）。
    let raw = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZab";
    let mixin = bilibili_mixin_key(raw);
    assert_eq!(mixin.len(), 32);
    // 置换表 32 位全部来自表内槽位：首 raw[46]、次 raw[47]、第 32 位 raw[13]。
    assert_eq!(mixin.as_bytes()[0], raw.as_bytes()[46]);
    assert_eq!(mixin.as_bytes()[1], raw.as_bytes()[47]);
    assert_eq!(mixin.as_bytes()[31], raw.as_bytes()[13]);
}

#[test]
fn wbi_key_from_url_takes_filename_without_extension() {
    assert_eq!(
        wbi_key_from_url(Some(
            "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png"
        )),
        Some("7cd084941338484aae1ad9425b84077c".to_string())
    );
    assert_eq!(wbi_key_from_url(None), None);
}

#[test]
fn wbi_search_query_is_deterministic_and_sanitized() {
    let first = wbi_search_query("晴天!(ju)*", 12, "1700000000", "mixin");
    let second = wbi_search_query("晴天!(ju)*", 12, "1700000000", "mixin");
    assert_eq!(first, second);
    assert!(first.starts_with(
        "keyword=%E6%99%B4%E5%A4%A9ju&page=1&page_size=12&search_type=video&wts=1700000000&w_rid="
    ));
    let w_rid = first.rsplit('=').next().unwrap();
    assert_eq!(w_rid.len(), 32);
    assert_eq!(
        w_rid,
        format!("{:x}", md5::compute(
            "keyword=%E6%99%B4%E5%A4%A9ju&page=1&page_size=12&search_type=video&wts=1700000000mixin"
        ))
    );
}

#[test]
fn search_json_maps_to_song_dto() {
    let value = serde_json::json!({
        "code": 0,
        "data": { "result": [{
            "bvid": "BV1xx411c7mD",
            "aid": 123,
            "title": "<em class=\"keyword\">晴天</em>",
            "author": " uploader ",
            "duration": "5:30",
            "pic": "//i0.hdslb.com/bfs/a.jpg"
        }, { "bvid": "" }] }
    });
    let songs = parse_search_results(&value);
    assert_eq!(songs.len(), 1);
    assert_eq!(songs[0].id, "bilibili-BV1xx411c7mD");
    assert_eq!(songs[0].bvid, "BV1xx411c7mD");
    assert_eq!(songs[0].name, "晴天");
    assert_eq!(songs[0].artist, " uploader ");
    assert_eq!(songs[0].album, "Bilibili");
    assert_eq!(songs[0].duration_seconds, 330);
    assert_eq!(songs[0].cover_url, "https://i0.hdslb.com/bfs/a.jpg");
    assert!(songs[0].plain);
}

#[test]
fn extract_bilibili_id_finds_bv_and_av() {
    assert_eq!(
        extract_bilibili_id("https://www.bilibili.com/video/BV1GJ411x7h7?p=1"),
        Some("BV1GJ411x7h7".to_string())
    );
    assert_eq!(
        extract_bilibili_id("看 av170001 吧"),
        Some("av170001".to_string())
    );
    assert_eq!(extract_bilibili_id("nothing"), None);
}

const DANMAKU_FIXTURE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<i><chatserver>chat.bilibili.com</chatserver><maxlimit>200</maxlimit>
<d p="0.91,1,25,16777215,1700000001,0,abc123,111">前奏一起就哭了</d>
<d p="12.50,1,25,16711680,1700000002,0,def456,222">红字弹幕</d>
<d p="12.50,1,25,16711680,1700000003,0,def456,222">红字弹幕</d>
<d p="120.00,4,25,65280,1700000004,0,ghi789,333"></d>
<d p="5.20,1,25,255,1700000005,0,jkl012,444">&lt;b&gt;转义&lt;/b&gt; &amp; 蓝色</d>
</i>"#;

#[test]
fn danmaku_xml_parse_sorts_dedupes_and_decodes() {
    let items = parse_bilibili_danmaku_xml(DANMAKU_FIXTURE);
    assert_eq!(items.len(), 3);
    assert_eq!(items[0].time, 0.91);
    assert_eq!(items[0].text, "前奏一起就哭了");
    assert_eq!(items[0].color, 0x00FF_FFFF);
    assert_eq!(items[1].time, 5.2);
    assert_eq!(items[1].text, "<b>转义</b> & 蓝色");
    assert_eq!(items[1].color, 255);
    assert_eq!(items[2].color, 0xFF0000);
}
