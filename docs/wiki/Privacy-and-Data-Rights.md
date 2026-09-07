# privacy and data rights

samples, drafts, profiles, and candidates stay on the machine running the CLI. verification is read-only. explicit or separately approved learning can write a local event under `~/.hyv/learning/`, scoped to a fingerprint of the profile. the event contains finding IDs, severity, count, timestamp, and an opaque one-way candidate digest used only to avoid counting the same candidate twice; it never contains draft or candidate text. `hyv learning add` stores the instruction supplied by the user. the repository excludes user profiles, client text, access tokens, private prompts, embeddings, and private datasets.

the public ChatGPT plugin is different: it is a skills-only editorial workflow. text that a user places in a ChatGPT conversation is handled by ChatGPT under the applicable OpenAI terms and privacy policy. the plugin does not execute the local HYV CLI, create a local profile, or carry the CLI's local-only data guarantee into ChatGPT.

only commit material you have the right to share. do not commit `~/.hyv/learning/` or copy its data into issues. a profile aggregates vocabulary and preferences, so treat it as sensitive even though it is JSON. use synthetic or rights-cleared fixtures, and document provenance when a contribution includes text.
