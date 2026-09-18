import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

function safeFilePath(requestUrl) {
  const rawPath = requestUrl?.split("?")[0] ?? "/";
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const requestedPath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = resolve(ROOT, requestedPath);
  const outsideRoot = relative(ROOT, filePath);
  return outsideRoot.startsWith("..") || isAbsolute(outsideRoot) ? null : filePath;
}

const server = createServer(async (req, res) => {
  const filePath = safeFilePath(req.url);
  if (!filePath) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

const port = 4173;
server.listen(port, () => console.log(`ProgressGate demo running at http://localhost:${port}`));
