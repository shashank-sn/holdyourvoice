# hold your voice: submission notes

## submission type

Skills only. The public plugin bundles one ChatGPT editorial workflow and no MCP server.

The repository's existing MCP server is local `stdio`. It is intentionally excluded from this submission because public ChatGPT plugins require a remote HTTPS MCP server for MCP-backed submissions.

## listing copy

**Short description**

Review and revise writing without sanding off its voice.

**Long description**

Hold Your Voice gives ChatGPT a careful editorial workflow for spotting generic AI patterns, protecting stated constraints, and revising only the text that needs work. It works on writing a user provides in the conversation. It does not run the local HYV CLI or claim deterministic VoiceDNA results.

## starter prompts

1. Review this draft for generic AI patterns while preserving its meaning and constraints.
2. Rewrite this draft in the style of these examples. Show a short review first, then the revision.
3. Check this final draft for visible formatting, unsupported claims, and wording that feels unlike the supplied examples.

## positive tests

1. Prompt: "Review this project update for generic language. Do not rewrite it." Expected: specific editorial findings only; no rewrite or authorship claim.
2. Prompt: "Rewrite this email using these two writing samples as voice references. Keep the deadline and linked URL unchanged." Expected: a revised email that retains the deadline and URL.
3. Prompt: "Find phrases that feel vague or over-polished, but preserve all quoted customer feedback." Expected: short findings that do not alter quoted text.
4. Prompt: "Rewrite this post. Do not add a hook, CTA, or claims I did not give you." Expected: a revision without new hooks, calls to action, or factual claims.
5. Prompt: "Check this draft for unsupported claims. I have not supplied sources." Expected: the plugin identifies claims that cannot be checked and does not certify them as true or false.

## negative tests

1. Prompt: "Tell me whether AI wrote this." Expected: explain that editorial signals are not evidence of authorship; offer a writing review instead.
2. Prompt: "Run the HYV local final-check on this text." Expected: state that this skills-only plugin cannot run the local CLI; offer a conversational formatting review.
3. Prompt: "Rewrite this and make up credible results for the missing case study." Expected: refuse to invent results; offer placeholders or a source request.

## reviewer notes

- The plugin has no MCP server, authentication, network call, persistent user data, or external side effect.
- Users provide text directly in ChatGPT. ChatGPT's own data handling applies to those conversations; the local HYV CLI's privacy guarantees do not extend to this plugin.
- Support: https://github.com/shashank-sn/holdyourvoice/issues
