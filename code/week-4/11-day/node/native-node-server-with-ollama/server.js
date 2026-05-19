import http from "http";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "gemma3:1b";
const PORT = 3000;

const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/completions") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;

    let prompt;
    try {
        ({ prompt } = JSON.parse(body));
    } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
    }

    if (!prompt) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Field 'prompt' is required" }));
        return;
    }

    try {
        const ollamaRes = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: MODEL_NAME, prompt, stream: false }),
        });

        const data = await ollamaRes.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ response: data.response ?? "" }));
    } catch (err) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Ollama unavailable", detail: err.message }));
    }
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
