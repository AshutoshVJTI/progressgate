import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname; // serve from the project root so ../demo/ links resolve
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

const server = createServer(async (req, res) => {
  let path = req.url === "/" ? "/landing/index.html" : req.url.split("?")[0];
  path = normalize(path);
  try {
    const file = await readFile(join(ROOT, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

const port = 4174;
server.listen(port, () => console.log(`ProgressGate landing page running at http://localhost:${port}`));
