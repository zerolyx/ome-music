use super::*;
use base64::engine::general_purpose::STANDARD as BASE64;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use serde_json::json;

type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;

/// 测试专用：两层 CBC 反解，验证 weapi 密文可还原为原始 JSON。
fn aes_cbc_decrypt_base64(ciphertext_b64: &str, key: &str, iv: &str) -> Result<String, String> {
    let ciphertext = BASE64
        .decode(ciphertext_b64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    let decryptor = Aes128CbcDec::new_from_slices(key.as_bytes(), iv.as_bytes())
        .map_err(|e| format!("AES key/iv 无效: {e}"))?;
    let plain = decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(&ciphertext)
        .map_err(|e| format!("AES 解密失败: {e}"))?;
    String::from_utf8(plain).map_err(|e| format!("UTF-8 解码失败: {e}"))
}

// 期望值由 node 对照参考实现预先算出（见任务报告），硬编码以保证确定性。
/// node: aes-128-ecb(eapiKey) over "/api/test-36cd479b6b5-{\"a\":1,\"e_r\":false}-36cd479b6b5-<md5>"
const NODE_EAPI_VECTOR_HEX: &str = "4dc723619a991588865191fd2f319badc7875d4b6848f7306effd33eedd3b532625080d0c48bd877ec4ee85526523f50f84acc9f2c88d7de68a95152be31d50b65893588f6ed8b81c5c245fa41e381d79ccfc6b4e822e6af929df226ee0ab348";
/// node: crypto.publicEncrypt(RSA_NO_PADDING) over reversed("abcdefghijklmnop")，与 forge rsaEncrypt('NONE') 等价
const NODE_RSA_VECTOR_HEX: &str = "d15a1683c992095d0c234c19966605c5c5964911268bbeda8cb8d08d834913e59d53b32358903a121b5fca784c1f5ae44951fd02524df58ecc98e52cc7cf8689b42c2e93ddf05b0592512d87f5960467e2f086c018849d76014d323500e30f13ef4cafbb0cf5a66731a3f1776c75ca35d0062dac70a3e33245afabcf47938487";
const SECRET: &str = "abcdefghijklmnop";

#[test]
fn weapi_with_secret_round_trips_to_original_json() {
    let data = json!({ "a": 1, "e_r": false });
    let (params, _enc_sec_key) = weapi_with_secret(&data, SECRET);
    let inner = aes_cbc_decrypt_base64(&params, SECRET, WEAPI_IV).unwrap();
    let text = aes_cbc_decrypt_base64(&inner, WEAPI_PRESET_KEY, WEAPI_IV).unwrap();
    assert_eq!(text, data.to_string());
}

#[test]
fn enc_sec_key_is_256_lowercase_hex_chars() {
    let (_params, enc_sec_key) = weapi_with_secret(&json!({ "type": 3 }), SECRET);
    assert_eq!(enc_sec_key.len(), 256);
    assert!(
        enc_sec_key
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
        "encSecKey 必须是小写 hex: {enc_sec_key}"
    );
}

#[test]
fn enc_sec_key_matches_reference_rsa_none_vector() {
    let (_params, enc_sec_key) = weapi_with_secret(&json!({ "type": 3 }), SECRET);
    assert_eq!(enc_sec_key, NODE_RSA_VECTOR_HEX);
}

#[test]
fn eapi_matches_reference_vector() {
    let params = eapi("/api/test", &json!({ "a": 1, "e_r": false }));
    assert_eq!(params, NODE_EAPI_VECTOR_HEX);
}

#[test]
fn eapi_output_is_lowercase_hex_and_block_aligned() {
    let params = eapi("/api/cloudsearch/pc", &json!({ "s": "晴天" }));
    assert!(!params.is_empty());
    assert_eq!(params.len() % 32, 0, "AES-128 密文必须是 16 字节块的 hex");
    assert!(
        params
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
        "eapi params 必须是小写 hex"
    );
}

#[test]
fn random_secret_is_16_base62_chars() {
    for _ in 0..32 {
        let secret = random_secret();
        assert_eq!(secret.len(), 16);
        assert!(secret.chars().all(|c| BASE62.contains(c)), "{secret}");
    }
}

#[test]
fn weapi_with_secret_is_deterministic_per_secret() {
    let data = json!({ "s": "晴天", "type": 1 });
    let first = weapi_with_secret(&data, SECRET);
    let second = weapi_with_secret(&data, SECRET);
    assert_eq!(first, second);
}

#[test]
fn weapi_randomizes_secret_per_call() {
    let data = json!({ "s": "晴天" });
    let (a, _) = weapi(&data);
    let (b, _) = weapi(&data);
    assert_ne!(a, b, "两次 weapi 调用应使用不同随机 secretKey");
}
