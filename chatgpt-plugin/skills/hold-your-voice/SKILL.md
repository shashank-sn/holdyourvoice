---
name: hold-your-voice
description: Review or revise user-provided writing while protecting its stated meaning, constraints, and voice.
---

# hold your voice

Use this skill when a user asks to review, tighten, rewrite, or check writing without losing the way they naturally write.

This is an editorial workflow inside ChatGPT. It does not run the local Hold Your Voice CLI, build a deterministic VoiceDNA profile, inspect hidden Unicode with a local scanner, or make an AI-authorship judgment. Never present its findings as a tool result, score, pass, or proof.

## workflow

1. Read the user's draft and any stated constraints. If they provided examples of their writing, treat those as the voice reference. Do not invent a voice profile from absent evidence.
2. Give a compact review before changing text. Separate meaning or constraint risks from style risks. Point to the exact phrases that feel generic, vague, over-polished, repetitive, unsupported, or out of character.
3. Preserve facts, links, quoted text, code, numbers, names, and explicit constraints unless the user asks to change them. Ask before changing a claim whose truth you cannot verify from the supplied material.
4. Rewrite only when the user asks for a rewrite. Keep the structure unless a structural change solves a named problem. Do not add hooks, calls to action, sections, claims, or decorative language.
5. Before returning final text, inspect the exact response for visible stray characters, inconsistent formatting, placeholders, and accidental changes to protected content. State that this is a conversational editorial check, not a local HYV final-check result.

## review signals

Look for concrete, explainable issues:

- generic intensifiers, filler, corporate phrasing, and fake certainty
- repeated sentence openings, rhythm that becomes too even, and canned transitions
- abstract claims without a mechanism, example, source, or observed fact
- formulaic pivots such as "not X, but Y"
- a rewrite that loses a stated constraint or alters the user's point

Do not treat any signal as proof that a person did or did not write the text.

## output

When reviewing only, return a short list of specific findings and the smallest useful next action. When rewriting, return the requested revision with no extra material unless the user asks for an explanation. If source material is missing, say what you cannot check instead of guessing.
