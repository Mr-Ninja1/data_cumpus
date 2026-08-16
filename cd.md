
## Check your diagram list against what Mermaid actually covers

| Diagram type (from your spec) | Mermaid support |
|---|---|
| Sequence Diagram | ✅ native, excellent |
| Class Diagram | ✅ native, excellent |
| State Machine Diagram | ✅ native (`stateDiagram-v2`) |
| Activity Diagram | ✅ via flowchart syntax |
| Contextual Model | ✅ via flowchart (system + external entities as nodes) |
| Conceptual Framework | ✅ via flowchart (central node → pillar nodes) |
| **Use Case Model** | ❌ **not natively supported** |

Use Case diagrams (actors as stick figures, ovals for use cases, association lines) just aren't part of Mermaid's syntax set. Don't force it — build one small custom template for this one type instead (details below). Everything else on your list maps cleanly.

## The core pipeline — same "generate image, then embed" principle you already have, Mermaid just fills the middle step

```
LLM generates Mermaid syntax (text)
   → validate syntax
   → render server-side to PNG/SVG
   → embed as a normal image in the docx
```

The model never touches pixels — it writes something like:

```
sequenceDiagram
    participant Student
    participant System
    participant WebAuthn
    Student->>System: Initiate login
    System->>WebAuthn: Request roaming credential
    WebAuthn-->>System: Return signed assertion
    System-->>Student: Grant session
```

This is far more reliable than asking for SVG/drawing coordinates directly, because Mermaid's syntax is small, constrained, and — critically — **validatable before rendering**, which gives you a clean retry loop instead of a silently broken diagram.

## Rendering, server-side, for Next.js

Client-side mermaid.js (the library you'd use for live preview in a browser) isn't the right tool for producing a file to embed in a docx generated on your backend. Use `@mermaid-js/mermaid-cli` (the `mmdc` command), which runs headless Chrome under the hood and converts a `.mmd` file straight to PNG/SVG — this runs fine as a step in a Node/Next.js API route or background job:

```bash
npx mmdc -i diagram.mmd -o diagram.png -b transparent -w 1200
```

Call it as a subprocess from your generation job. If you'd rather avoid managing headless Chrome yourself, a self-hosted Kroki instance does the same job over HTTP and is simpler to keep running in a container — either is fine, pick based on how much infra you want to own.

## Validate before rendering, and retry with the error fed back

```
1. LLM generates Mermaid syntax
2. Run it through mermaid's own parser/lint step (available via the
   mermaid npm package's parse function) BEFORE attempting a full render
3. If invalid → retry the generation call once, appending the actual
   parser error to the prompt ("your last diagram failed to parse: <error>.
   Fix and regenerate.")
4. If still invalid after one retry → fall back to the unsupported_reframe
   behavior from before: tell the user the diagram couldn't be generated
   reliably, don't silently embed something broken or skip it without
   saying so
```

This mirrors the exact JSON-validation-retry pattern already in place for the spec extraction — same discipline, different artifact type.

## Styling — tie it to your existing `style_spec.json`, don't hardcode diagram colors separately

Mermaid supports a `themeVariables` config block — primary color, font, line color, etc. Feed it from the same brand config used everywhere else, so diagrams visually match the rest of the document and the "change theme color to green" edit command (from way earlier) automatically applies here too, with zero extra work:

```js
%%{init: {'theme':'base', 'themeVariables': {
  'primaryColor': '#1a3c6e',
  'primaryTextColor': '#000',
  'lineColor': '#1a3c6e',
  'fontFamily': 'Calibri'
}}}%%
```

## The Use Case diagram gap — small custom template, not Mermaid

Use case diagrams are actually formulaic content-wise (a list of actors, a list of use cases, association lines between them) — perfect for a simple generated SVG template rather than reaching for a heavier tool like PlantUML just for this one type. Have the LLM output structured data instead of drawing syntax:

```json
{ "actors": ["Student", "Admin"], "use_cases": ["Cast Vote", "View Results", "Manage Election"],
  "associations": [["Student", "Cast Vote"], ["Student", "View Results"], ["Admin", "Manage Election"]] }
```

Then a small deterministic SVG-builder function (same pattern as the fish/pliers/rectangle diagrams built earlier in this conversation) lays out actors as simple stick figures, use cases as ovals, and draws the association lines. Fully code-driven, no rendering-reliability risk at all — it's the diagrams-as-structured-data-then-code-drawn approach, just applied to this one specific gap.

## Registry structure — add this to your spec so every diagram type declares its own method

```json
"diagram_registry": {
  "conceptual_framework": { "method": "mermaid", "mermaid_type": "flowchart" },
  "contextual_model": { "method": "mermaid", "mermaid_type": "flowchart" },
  "use_case_model": { "method": "custom_svg_template", "template": "use_case_diagram" },
  "sequence_diagram": { "method": "mermaid", "mermaid_type": "sequenceDiagram" },
  "state_machine_diagram": { "method": "mermaid", "mermaid_type": "stateDiagram-v2" },
  "activity_diagram": { "method": "mermaid", "mermaid_type": "flowchart" },
  "class_diagram": { "method": "mermaid", "mermaid_type": "classDiagram" }
}
```

`generate_diagram(diagram_key)` looks up the method here first, then branches to either the Mermaid pipeline or the custom-SVG path — one function, two backends, easy to add a third method later if some future diagram type needs it. And this plugs straight into the `regenerate_diagram(diagram_key, instruction)` tool from the intent-classifier work — same tool, same routing, it just now has a real implementation underneath instead of a stub.
