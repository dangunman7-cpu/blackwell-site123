// Shared chat logic. Settings come from the host's environment variables:
//   GEMINI_API_KEY  your Google AI Studio key
//   AI_MODEL        model name, e.g. gemini-3.5-flash-lite
//   AI_THINKING     optional, e.g. "low" (speed vs. smartness)
async function runChat(messages, env) {
  const key = env.GEMINI_API_KEY;
  const model = (env.AI_MODEL || "gemini-3.8-flash")
    .trim()
    .replace(/^AI_MODEL\s*=\s*/i, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/^models\//, "")
    .trim();
  if (!key) return [500, { error: "GEMINI_API_KEY is not set. Add it in your host's environment variables and redeploy." }];
  if (!/^[A-Za-z0-9._-]+$/.test(model)) {
    return [500, { error: 'AI_MODEL looks wrong: "' + model + '". It should be a single name like gemini-3.8-flash.' }];
  }
  if (!Array.isArray(messages) || !messages.length || messages.length > 60) return [400, { error: "Bad request." }];

  const okMime = /^image\/(png|jpeg|webp|gif)$/;
  const contents = messages.map((m) => {
    const parts = [];
    if (m.img && okMime.test(m.img.mime) && typeof m.img.data === "string" && m.img.data.length < 4000000) {
      parts.push({ inlineData: { mimeType: m.img.mime, data: m.img.data } });
    }
    parts.push({ text: String(m.content).slice(0, 20000) });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const body = { contents };
  const level = (env.AI_THINKING || "").trim().toLowerCase();
  if (/^[a-z]+$/.test(level)) body.generationConfig = { thinkingConfig: { thinkingLevel: level } };

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) }
    );
    const j = await r.json();
    if (!r.ok) return [r.status, { error: (j.error && j.error.message) || "Gemini error." }];
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map((p) => p.text || "").join("");
    if (!text) return [502, { error: "The model returned no text." }];
    return [200, { text }];
  } catch (e) {
    return [502, { error: "Couldn’t reach Gemini." }];
  }
}

exports.handler = async (event) => {
  const reply = (status, obj) => ({ statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });
  let messages;
  try { messages = JSON.parse(event.body).messages; } catch (e) { return reply(400, { error: "Bad request." }); }
  const [status, obj] = await runChat(messages, process.env);
  return reply(status, obj);
};
