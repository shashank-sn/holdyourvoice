---
name: hyv-evaluate-local
description: Run the optional deterministic local writing evaluation composite without model calls.
---

# hyv-evaluate-local

Evaluate a caller-supplied candidate against an input and separate local user and AI-shadow paragraph fixtures. The module trains only on the paragraph IDs assigned to the train split. It does not generate prose, transmit samples, retain text, or establish authorship.

```text
hyv evaluate-local input.md candidate.md user-paragraphs.json ai-shadow-paragraphs.json
```

Each JSON file is an array of `{ "paragraph_id": "stable-id", "text": "..." }`. Keep variants under the same paragraph ID; HYV splits by ID before training. The report contains a train-only TF-IDF logistic-regression proxy, content F1, AI-tell change, and 9-d stylometric cosine. Treat every number as a local evaluation signal, not a publishing decision or identity claim.
