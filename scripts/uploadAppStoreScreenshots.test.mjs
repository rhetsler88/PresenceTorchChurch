/**
 * Runs the upload script against a stub of the App Store Connect API, so the
 * whole flow — token, version lookup, set creation, chunked bytes, checksum
 * commit — is exercised without real credentials.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const uploadScript = join(scriptsDir, "upload-app-store-screenshots.mjs");

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/** Rejects a token Apple would reject, so a passing run means the JWT is real. */
function assertValidToken(request, state) {
  const token = (request.headers.authorization ?? "").replace("Bearer ", "");
  const [header, payload, signature] = token.split(".");
  const signed = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signature ?? "", "base64url"),
  );
  if (!signed) state.badToken = true;
}

/**
 * @param appStoreState which version state the stub reports back
 */
function startStubApi({ appStoreState = "PREPARE_FOR_SUBMISSION" } = {}) {
  const state = { uploads: new Map(), committed: [], createdSets: [], badToken: false };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const send = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body ?? {}));
    };

    // Byte uploads carry Apple's own headers, not our bearer token.
    if (url.pathname.startsWith("/upload/")) {
      const id = url.pathname.split("/").pop();
      const previous = state.uploads.get(id) ?? [];
      state.uploads.set(id, [...previous, await readBody(request)]);
      return send(200, {});
    }

    assertValidToken(request, state);

    if (url.pathname === "/v1/apps") {
      return send(200, { data: [{ id: "app-1", attributes: { name: "Presence Torch" } }] });
    }
    if (url.pathname === "/v1/apps/app-1/appStoreVersions") {
      return send(200, { data: [{ id: "ver-1", attributes: { versionString: "1.0.55", appStoreState } }] });
    }
    if (url.pathname === "/v1/appStoreVersions/ver-1/appStoreVersionLocalizations") {
      return send(200, { data: [{ id: "loc-1", attributes: { locale: "en-US" } }] });
    }
    if (url.pathname === "/v1/appStoreVersionLocalizations/loc-1/appScreenshotSets") {
      return send(200, { data: [] });
    }
    if (url.pathname === "/v1/appScreenshotSets" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      state.createdSets.push(body.data.attributes.screenshotDisplayType);
      return send(201, { data: { id: "set-1", attributes: body.data.attributes } });
    }
    if (url.pathname === "/v1/appScreenshotSets/set-1/appScreenshots") {
      return send(200, { data: [] });
    }
    if (url.pathname === "/v1/appScreenshots" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      const { fileName, fileSize } = body.data.attributes;
      const id = `shot-${state.uploads.size + state.committed.length + 1}`;
      const half = Math.floor(fileSize / 2);
      // Two operations on purpose: Apple splits large files, and the client
      // has to send each range separately rather than the whole buffer twice.
      return send(201, {
        data: {
          id,
          attributes: {
            fileName,
            uploadOperations: [
              { method: "PUT", url: `${base}/upload/${id}`, offset: 0, length: half, requestHeaders: [] },
              { method: "PUT", url: `${base}/upload/${id}`, offset: half, length: fileSize - half, requestHeaders: [] },
            ],
          },
        },
      });
    }
    if (url.pathname.startsWith("/v1/appScreenshots/") && request.method === "PATCH") {
      const id = url.pathname.split("/").pop();
      const body = JSON.parse(await readBody(request));
      const received = Buffer.concat(state.uploads.get(id) ?? []);
      state.committed.push({
        id,
        checksumMatches: createHash("md5").update(received).digest("hex") === body.data.attributes.sourceFileChecksum,
        bytes: received.length,
      });
      return send(200, { data: { id } });
    }
    return send(404, { errors: [{ title: "Not found", detail: url.pathname }] });
  });

  server.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/v1`.replace("/v1", "");
  return { server, state, baseUrl: `${base}/v1` };
}

function runUpload(baseUrl, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [uploadScript, ...args], {
      env: {
        ...process.env,
        ASC_API_BASE: baseUrl,
        ASC_KEY_ID: "KEY123",
        ASC_ISSUER_ID: "issuer-1",
        ASC_PRIVATE_KEY: privateKeyPem,
        ASC_BUNDLE_ID: "church.presencetorch.app",
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

const servers = [];
after(() =>
  servers.forEach(({ server }) => {
    // The child's fetch leaves keep-alive sockets open, which would hold the
    // runner past the last assertion.
    server.closeAllConnections();
    server.close();
  }),
);

describe("upload-app-store-screenshots", () => {
  it("uploads a slot's frames and commits each with a matching checksum", async () => {
    const stub = startStubApi();
    servers.push(stub);

    const { code, output } = await runUpload(stub.baseUrl, ["--only=iphone-6.5-inch-1284x2778"]);

    assert.equal(code, 0, output);
    assert.equal(stub.state.badToken, false, "the stub rejected our JWT");
    assert.deepEqual(stub.state.createdSets, ["APP_IPHONE_65"]);
    assert.equal(stub.state.committed.length, 3);
    for (const commit of stub.state.committed) {
      assert.equal(commit.checksumMatches, true, "reassembled bytes did not match the committed checksum");
      assert.ok(commit.bytes > 50_000);
    }
    assert.match(output, /uploaded 01-signin\.jpg/);
    assert.match(output, /uploaded 03-talk\.jpg/);
  });

  it("changes nothing on a dry run", async () => {
    const stub = startStubApi();
    servers.push(stub);

    const { code, output } = await runUpload(stub.baseUrl, ["--dry-run", "--only=iphone-6.9-inch-1320x2868"]);

    assert.equal(code, 0, output);
    assert.equal(stub.state.committed.length, 0);
    assert.equal(stub.state.createdSets.length, 0);
    assert.match(output, /would upload 01-signin\.jpg/);
    assert.match(output, /Dry run only/);
  });

  it("explains that a submitted version cannot take screenshots", async () => {
    const stub = startStubApi({ appStoreState: "WAITING_FOR_REVIEW" });
    servers.push(stub);

    const { code, output } = await runUpload(stub.baseUrl, ["--only=iphone-6.5-inch-1284x2778"]);

    assert.notEqual(code, 0);
    assert.match(output, /No version accepts metadata edits right now: 1\.0\.55 \(WAITING_FOR_REVIEW\)/);
    assert.match(output, /read-only once a version is submitted/);
    assert.equal(stub.state.committed.length, 0);
  });
});
