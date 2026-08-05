# architecture

`text.ts` provides sentence and word measurements. `voice-dna.ts` builds and evaluates profiles. `ai-editor.ts` owns the deterministic rules. `pipeline.ts` is the only composition layer: it combines pass states but never scores. `cli.ts` reads local files or standard input and writes only an explicit profile path.

there is no hosted API, telemetry path, account boundary, payment flow, or runtime network request in the core path. an editor or model receives the generated brief outside this package. the optional Claude Desktop extension is a local stdio MCP adapter around the same engine; it does not create a hosted path.
