//! Personality preset catalog.
//!
//! A Pet Profile stores both a personality id and the resolved trait values.
//! The two must change together, so Pet Birth and pet updates read the preset
//! from here rather than trusting a caller-supplied trait blob.

use serde_json::Value;

// coupling: keep these in sync with the factories in
// packages/pet-engine/src/pets/personalities/factories.ts
pub const PERSONALITY_IDS: [&str; 13] = [
    "playful",
    "attentive",
    "reserved",
    "curious",
    "steady",
    "feisty",
    "gentle",
    "mischievous",
    "lazy",
    "zen",
    "aloof",
    "skittish",
    "shrewd",
];

/// The stored trait values for a personality id, or `None` when the id is not a
/// known preset.
pub fn personality_preset(personality_id: &str) -> Option<Value> {
    match personality_id {
        "playful" => Some(serde_json::json!({
            "standForce": 0.0008,
            "pursueForce": 0.0016,
            "arriveForce": 0.002,
            "idleConversationMs": 9000,
            "completionIntent": "arrive",
            "openness": 0.75,
            "conscientiousness": 0.3,
            "extraversion": 0.95,
            "agreeableness": 0.55,
            "neuroticism": 0.08
        })),
        "attentive" => Some(serde_json::json!({
            "standForce": 0.0005,
            "pursueForce": 0.001,
            "arriveForce": 0.0016,
            "idleConversationMs": 11000,
            "completionIntent": "arrive",
            "openness": 0.25,
            "conscientiousness": 0.72,
            "extraversion": 0.72,
            "agreeableness": 0.95,
            "neuroticism": 0.15
        })),
        "reserved" => Some(serde_json::json!({
            "standForce": 0.0004,
            "pursueForce": 0.0008,
            "arriveForce": 0.001,
            "completionIntent": "stand",
            "openness": 0.22,
            "conscientiousness": 0.55,
            "extraversion": 0.12,
            "agreeableness": 0.38,
            "neuroticism": 0.82
        })),
        "curious" => Some(serde_json::json!({
            "standForce": 0.0007,
            "pursueForce": 0.0013,
            "arriveForce": 0.0015,
            "idleConversationMs": 13000,
            "completionIntent": "arrive",
            "openness": 0.98,
            "conscientiousness": 0.35,
            "extraversion": 0.45,
            "agreeableness": 0.55,
            "neuroticism": 0.3
        })),
        "steady" => Some(serde_json::json!({
            "standForce": 0.00045,
            "pursueForce": 0.0009,
            "arriveForce": 0.0012,
            "idleConversationMs": 20000,
            "completionIntent": "stand",
            "openness": 0.35,
            "conscientiousness": 0.95,
            "extraversion": 0.4,
            "agreeableness": 0.7,
            "neuroticism": 0.06
        })),
        "feisty" => Some(serde_json::json!({
            "standForce": 0.0009,
            "pursueForce": 0.0018,
            "arriveForce": 0.0022,
            "idleConversationMs": 9000,
            "completionIntent": "arrive",
            "openness": 0.55,
            "conscientiousness": 0.4,
            "extraversion": 0.85,
            "agreeableness": 0.3,
            "neuroticism": 0.6
        })),
        "gentle" => Some(serde_json::json!({
            "standForce": 0.0004,
            "pursueForce": 0.0008,
            "arriveForce": 0.001,
            "idleConversationMs": 14000,
            "completionIntent": "arrive",
            "openness": 0.45,
            "conscientiousness": 0.65,
            "extraversion": 0.3,
            "agreeableness": 0.98,
            "neuroticism": 0.12
        })),
        "mischievous" => Some(serde_json::json!({
            "standForce": 0.001,
            "pursueForce": 0.002,
            "arriveForce": 0.0025,
            "idleConversationMs": 8000,
            "completionIntent": "arrive",
            "openness": 0.9,
            "conscientiousness": 0.1,
            "extraversion": 0.82,
            "agreeableness": 0.32,
            "neuroticism": 0.35
        })),
        "lazy" => Some(serde_json::json!({
            "standForce": 0.0002,
            "pursueForce": 0.0005,
            "arriveForce": 0.0007,
            "idleConversationMs": 30000,
            "completionIntent": "stand",
            "openness": 0.28,
            "conscientiousness": 0.18,
            "extraversion": 0.1,
            "agreeableness": 0.55,
            "neuroticism": 0.18
        })),
        "zen" => Some(serde_json::json!({
            "standForce": 0.00035,
            "pursueForce": 0.0007,
            "arriveForce": 0.0009,
            "idleConversationMs": 22000,
            "completionIntent": "stand",
            "openness": 0.6,
            "conscientiousness": 0.7,
            "extraversion": 0.45,
            "agreeableness": 0.8,
            "neuroticism": 0.02
        })),
        "aloof" => Some(serde_json::json!({
            "standForce": 0.00035,
            "pursueForce": 0.0007,
            "arriveForce": 0.0009,
            "idleConversationMs": 24000,
            "completionIntent": "stand",
            "openness": 0.4,
            "conscientiousness": 0.6,
            "extraversion": 0.15,
            "agreeableness": 0.08,
            "neuroticism": 0.3
        })),
        "skittish" => Some(serde_json::json!({
            "standForce": 0.0006,
            "pursueForce": 0.0013,
            "arriveForce": 0.0016,
            "completionIntent": "stand",
            "openness": 0.3,
            "conscientiousness": 0.4,
            "extraversion": 0.25,
            "agreeableness": 0.5,
            "neuroticism": 0.95
        })),
        "shrewd" => Some(serde_json::json!({
            "standForce": 0.0005,
            "pursueForce": 0.001,
            "arriveForce": 0.0013,
            "idleConversationMs": 21000,
            "completionIntent": "stand",
            "openness": 0.85,
            "conscientiousness": 0.82,
            "extraversion": 0.3,
            "agreeableness": 0.25,
            "neuroticism": 0.08
        })),
        _ => None,
    }
}
