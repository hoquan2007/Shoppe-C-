import { createServer } from "node:http";
import { guestSession } from "./handler.js";

const server = createServer(async (req, res) => {
  const response = guestSession({
    url: new URL(req.url, "http://localhost").href,
    method: req.method, headers: new Headers({ cookie: req.headers.cookie || "" }),
  });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(req.method === "HEAD" ? undefined : await response.text());
});
server.listen(Number(process.env.PORT || 3000), () => {
  console.info(JSON.stringify({ event: "guest_session_ready", port: server.address().port }));
});
