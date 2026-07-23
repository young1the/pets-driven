//! Pet Asset id validation.
//!
//! A Pet Asset id is addressed as a directory name by the sprite loader and as
//! a query parameter by the pet overlay window, so anything those two could not
//! resolve must be rejected before it reaches disk. The desktop crate reuses
//! this same check when it scans pet packages, so listing and hatching always
//! agree on which ids are addressable.

/// Whether a Pet Asset id is safe to persist and address: non-empty and made up
/// only of ASCII alphanumerics, `-`, and `_`.
pub fn is_valid_asset_id(asset_id: &str) -> bool {
    !asset_id.is_empty()
        && asset_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}
