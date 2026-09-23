//! weapi / eapi 加密。协议常量逐字对齐 NeteaseCloudMusicApi@4.32.0 `util/crypto.js`。

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use rsa::pkcs8::DecodePublicKey;
use rsa::traits::PublicKeyParts;
use rsa::{BigUint, RsaPublicKey};
use serde_json::Value;
use std::fmt::Write as _;
use std::sync::OnceLock;

use aes::Aes128;
use cbc::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use ecb::cipher::KeyInit as _;

type Aes128CbcEnc = cbc::Encryptor<Aes128>;
type Aes128EcbEnc = ecb::Encryptor<Aes128>;

/// weapi 固定偏移 IV。
pub const WEAPI_IV: &str = "0102030405060708";
/// weapi 内层固定预置密钥。
pub const WEAPI_PRESET_KEY: &str = "0CoJUm6Qyw8W8jud";
/// base62 字符集：小写在前，与参考实现一致。
pub const BASE62: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/// RSA 公钥 base64 体，来自 util/crypto.js（原文件为单行 PEM；RFC 7468 限行宽 64，
/// rust `pem-rfc7468` 解析严格，故以 64 字符/行重排，内容逐字不变）。
pub const PUBLIC_KEY_BASE64: &str = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB";
/// eapi 固定密钥。
pub const EAPI_KEY: &str = "e82ckenh8dichen8";

const EAPI_SEPARATOR: &str = "-36cd479b6b5-";
/// RSA-NONE 输出与模数等长：1024 位 = 128 字节 = 256 hex。
const RSA_MODULUS_BYTES: usize = 128;

#[cfg(test)]
#[path = "crypto_test.rs"]
mod crypto_test;

/// weapi 加密（注入固定 secretKey 的可测版本）。
///
/// `params = base64(AES128CBC(base64(AES128CBC(text, presetKey, iv)), secret, iv))`（PKCS7），
/// `encSecKey = hex(RSA_NONE(reverse(secret), publicKey))`。
pub fn weapi_with_secret(data: &Value, secret: &str) -> (String, String) {
    assert_eq!(secret.len(), 16, "weapi secretKey 固定 16 字符");
    let text = serde_json::to_string(data).expect("JSON 序列化不会失败");
    let inner = aes_cbc_encrypt_base64(&text, WEAPI_PRESET_KEY, WEAPI_IV);
    let params = aes_cbc_encrypt_base64(&inner, secret, WEAPI_IV);
    let reversed: String = secret.chars().rev().collect();
    (params, rsa_none_encrypt(&reversed))
}

/// weapi 加密：随机 base62 secretKey。
pub fn weapi(data: &Value) -> (String, String) {
    weapi_with_secret(data, &random_secret())
}

/// eapi 加密：`hex(AES128ECB("{uri}-36cd479b6b5-{text}-36cd479b6b5-{md5}", eapiKey))`，小写 hex。
pub fn eapi(uri: &str, data: &Value) -> String {
    let text = serde_json::to_string(data).expect("JSON 序列化不会失败");
    let message = format!("nobody{uri}use{text}md5forencrypt");
    let digest = format!("{:x}", md5::compute(message));
    let payload = format!("{uri}{EAPI_SEPARATOR}{text}{EAPI_SEPARATOR}{digest}");
    let encryptor =
        Aes128EcbEnc::new_from_slice(EAPI_KEY.as_bytes()).expect("eapi key 固定 16 字节");
    to_lowercase_hex(&encryptor.encrypt_padded_vec_mut::<Pkcs7>(payload.as_bytes()))
}

/// 随机 16 字符 base62 secretKey。
pub fn random_secret() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..16)
        .map(|_| BASE62.as_bytes()[rng.gen_range(0..BASE62.len())] as char)
        .collect()
}

fn aes_cbc_encrypt_base64(plaintext: &str, key: &str, iv: &str) -> String {
    let encryptor = Aes128CbcEnc::new_from_slices(key.as_bytes(), iv.as_bytes())
        .expect("weapi key/iv 固定 16 字节");
    BASE64.encode(encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()))
}

/// 裸 RSA-NONE：`BigUint::from_bytes_be(message).modpow(e, n)`，左补零到 128 字节，小写 hex。
fn rsa_none_encrypt(message: &str) -> String {
    let public_key = public_key();
    let m = BigUint::from_bytes_be(message.as_bytes());
    let c = m.modpow(public_key.e(), public_key.n());
    let bytes = c.to_bytes_be();
    let mut padded = vec![0u8; RSA_MODULUS_BYTES - bytes.len()];
    padded.extend_from_slice(&bytes);
    to_lowercase_hex(&padded)
}

fn public_key() -> &'static RsaPublicKey {
    static KEY: OnceLock<RsaPublicKey> = OnceLock::new();
    KEY.get_or_init(|| {
        let mut pem = String::from("-----BEGIN PUBLIC KEY-----\n");
        for chunk in PUBLIC_KEY_BASE64.as_bytes().chunks(64) {
            pem.push_str(std::str::from_utf8(chunk).expect("公钥为 ASCII"));
            pem.push('\n');
        }
        pem.push_str("-----END PUBLIC KEY-----");
        RsaPublicKey::from_public_key_pem(&pem).expect("内置公钥必须可解析")
    })
}

fn to_lowercase_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}
