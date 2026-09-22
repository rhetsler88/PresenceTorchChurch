import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, it } from "node:test";

import { SLOTS } from "../../src/lib/appStoreScreenshotSpec.js";
import { createClient, createToken, displayTypeFor, EDITABLE_STATES, md5 } from "./appStoreConnect.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

/** Records every call and replays queued responses, so no network is touched. */
function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, options = {}) => {
    calls.push({ url, ...options });
    const next = queue.shift() ?? { status: 200, body: {} };
    return {
      ok: next.status < 400,
      status: next.status,
      statusText: next.statusText ?? "",
      json: async () => next.body,
      text: async () => JSON.stringify(next.body ?? ""),
    };
  };
  impl.calls = calls;
  return impl;
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("createToken", () => {
  const token = createToken({
    issuerId: "issuer-1",
    keyId: "KEY123",
    privateKeyPem,
    now: 1_700_000_000_000,
  });

  it("signs a verifiable ES256 JWT in the raw signature form Apple requires", () => {
    const [header, payload, signature] = token.split(".");
    assert.deepEqual(decodeSegment(header), { alg: "ES256", kid: "KEY123", typ: "JWT" });
    const verified = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    assert.equal(verified, true);
  });

  it("targets the App Store Connect audience and expires inside Apple's 20 minute cap", () => {
    const payload = decodeSegment(token.split(".")[1]);
    assert.equal(payload.iss, "issuer-1");
    assert.equal(payload.aud, "appstoreconnect-v1");
    assert.equal(payload.iat, 1_700_000_000);
    assert.ok(payload.exp - payload.iat <= 20 * 60);
  });
});

describe("displayTypeFor", () => {
  it("maps every size we export", () => {
    for (const slot of SLOTS) {
      assert.ok(displayTypeFor(slot.width, slot.height), `no display type for ${slot.dir}`);
    }
  });

  it("groups the sizes Apple shares between one slot", () => {
    assert.equal(displayTypeFor(1320, 2868), displayTypeFor(1290, 2796));
    assert.equal(displayTypeFor(1284, 2778), displayTypeFor(1242, 2688));
    assert.notEqual(displayTypeFor(1242, 2208), displayTypeFor(1242, 2688));
  });

  it("returns null for an unknown size", () => {
    assert.equal(displayTypeFor(1179, 2556), null);
  });
});

describe("EDITABLE_STATES", () => {
  it("excludes the states where Apple locks metadata", () => {
    assert.equal(EDITABLE_STATES.has("WAITING_FOR_REVIEW"), false);
    assert.equal(EDITABLE_STATES.has("IN_REVIEW"), false);
    assert.equal(EDITABLE_STATES.has("READY_FOR_SALE"), false);
    assert.equal(EDITABLE_STATES.has("PREPARE_FOR_SUBMISSION"), true);
    assert.equal(EDITABLE_STATES.has("REJECTED"), true);
  });
});

describe("createClient", () => {
  it("authenticates and filters by bundle id", async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: { data: [{ id: "app-1" }] } }]);
    const app = await createClient({ token: "tok", fetchImpl }).findApp("church.presencetorch.app");

    assert.equal(app.id, "app-1");
    const [call] = fetchImpl.calls;
    assert.equal(call.url, "https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=church.presencetorch.app");
    assert.equal(call.headers.Authorization, "Bearer tok");
  });

  it("fails loudly when the bundle id matches nothing", async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: { data: [] } }]);
    await assert.rejects(() => createClient({ token: "tok", fetchImpl }).findApp("nope"), /No app found/);
  });

  it("surfaces Apple's own error text rather than a bare status", async () => {
    const fetchImpl = fakeFetch([
      {
        status: 409,
        statusText: "Conflict",
        body: { errors: [{ title: "Entity state invalid", detail: "The version is not editable" }] },
      },
    ]);
    await assert.rejects(
      () => createClient({ token: "tok", fetchImpl }).listVersions("app-1"),
      /409 Conflict — Entity state invalid: The version is not editable/,
    );
  });

  it("reserves a screenshot against its set", async () => {
    const fetchImpl = fakeFetch([{ status: 201, body: { data: { id: "shot-1" } } }]);
    await createClient({ token: "tok", fetchImpl }).reserveScreenshot({
      setId: "set-1",
      fileName: "01-signin.jpg",
      fileSize: 1234,
    });

    const [call] = fetchImpl.calls;
    assert.equal(call.method, "POST");
    assert.equal(call.headers["Content-Type"], "application/json");
    const body = JSON.parse(call.body);
    assert.deepEqual(body.data.attributes, { fileName: "01-signin.jpg", fileSize: 1234 });
    assert.equal(body.data.relationships.appScreenshotSet.data.id, "set-1");
  });

  it("sends each upload operation's own byte range with its headers", async () => {
    const fetchImpl = fakeFetch([{ status: 200 }, { status: 200 }]);
    const buffer = Buffer.from("abcdefghij");
    await createClient({ token: "tok", fetchImpl }).uploadBytes(
      [
        { method: "PUT", url: "https://upload/1", offset: 0, length: 4, requestHeaders: [{ name: "X-Part", value: "1" }] },
        { method: "PUT", url: "https://upload/2", offset: 4, length: 6, requestHeaders: [] },
      ],
      buffer,
    );

    assert.equal(fetchImpl.calls.length, 2);
    assert.equal(fetchImpl.calls[0].headers["X-Part"], "1");
    assert.equal(fetchImpl.calls[0].body.toString(), "abcd");
    assert.equal(fetchImpl.calls[1].body.toString(), "efghij");
  });

  it("reports a failed byte upload instead of committing a partial file", async () => {
    const fetchImpl = fakeFetch([{ status: 403, statusText: "Forbidden", body: {} }]);
    await assert.rejects(
      () =>
        createClient({ token: "tok", fetchImpl }).uploadBytes(
          [{ method: "PUT", url: "https://upload/1", offset: 0, length: 1 }],
          Buffer.from("a"),
        ),
      /Uploading bytes failed: 403 Forbidden/,
    );
  });

  it("commits with the checksum Apple verifies the bytes against", async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: { data: { id: "shot-1" } } }]);
    const buffer = Buffer.from("screenshot bytes");
    await createClient({ token: "tok", fetchImpl }).commitScreenshot("shot-1", md5(buffer));

    const [call] = fetchImpl.calls;
    assert.equal(call.method, "PATCH");
    const body = JSON.parse(call.body);
    assert.equal(body.data.attributes.uploaded, true);
    assert.equal(body.data.attributes.sourceFileChecksum, md5(buffer));
    assert.equal(body.data.id, "shot-1");
  });
});
