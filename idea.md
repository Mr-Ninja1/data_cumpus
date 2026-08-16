The one question that resolves this

Ask your coding agent directly: "After this payload is built, what function consumes specKey and chapterKey? Show me that function, and show me the literal, final string/messages array that actually gets sent to the Claude/Gemini API call."

Two possible answers, and they lead to different fixes:

There's no such function — specKey/chapterKey are stored but never looked up, and promptText alone (or close to it) goes straight to the model. → The fix is: add a resolution step that takes these keys, loads the real chapter data from base_spec.json, and builds a proper structured prompt before the API call.
The function exists but is broken/incomplete — e.g., it fetches the spec file but only pulls the chapter title, not the sections array, or it fetches successfully but never appends the result into what actually gets sent. → Same category of fix, but the bug is inside that specific function rather than a missing step entirely.
