/**
 * Minimal App Store Connect API client for screenshot uploads.
 *
 * The browser uploader accepts a file, then silently drops it when something
 * server-side objects. This path gets the objection as an actual error.
 *
 * https://developer.apple.com/documentation/appstoreconnectapi
 */
import { createHash, createPrivateKey, sign } from "crypto";

/** Overridable so the upload flow can be exercised against a stub API. */
const BASE = process.env.ASC_API_BASE ?? "https://api.appstoreconnect.apple.com/v1";

/** Apple groups several pixel sizes under one display type. */
export const DISPLAY_TYPES = {
  "1320x2868": "APP_IPHONE_67",
  "1290x2796": "APP_IPHONE_67",
  "1284x2778": "APP_IPHONE_65",
  "1242x2688": "APP_IPHONE_65",
  "1242x2208": "APP_IPHONE_55",
  "2064x2752": "APP_IPAD_PRO_3GEN_129",
  "2048x2732": "APP_IPAD_PRO_3GEN_129",
};

/** Versions Apple lets you edit metadata on; anything else rejects uploads. */
export const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

export function displayTypeFor(width, height) {
  return DISPLAY_TYPES[`${width}x${height}`] ?? null;
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

/**
 * ES256 JWT for the API. Apple caps the lifetime at 20 minutes and wants the
 * raw R||S signature form rather than the DER one Node produces by default.
 */
export function createToken({ issuerId, keyId, privateKeyPem, now = Date.now(), lifetimeSeconds = 900 }) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: issuerId,
      iat: issuedAt,
      exp: issuedAt + lifetimeSeconds,
      aud: "appstoreconnect-v1",
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function md5(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

/** Apple returns errors as a JSON:API array; surface all of them, not just a status. */
async function describeFailure(response) {
  let detail = "";
  try {
    const body = await response.json();
    detail = (body.errors ?? [])
      .map((error) => [error.title, error.detail].filter(Boolean).join(": "))
      .join(" | ");
  } catch {
    detail = await response.text().catch(() => "");
  }
  return `${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`;
}

export function createClient({ token, fetchImpl = fetch }) {
  async function request(path, { method = "GET", body } = {}) {
    const response = await fetchImpl(path.startsWith("http") ? path : `${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${await describeFailure(response)}`);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    async findApp(bundleId) {
      const { data } = await request(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
      if (data.length === 0) throw new Error(`No app found for bundle id ${bundleId}`);
      return data[0];
    },

    async listVersions(appId) {
      const { data } = await request(`/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`);
      return data;
    },

    async listLocalizations(versionId) {
      const { data } = await request(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
      return data;
    },

    async listScreenshotSets(localizationId) {
      const { data } = await request(`/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`);
      return data;
    },

    async listScreenshots(setId) {
      const { data } = await request(`/appScreenshotSets/${setId}/appScreenshots`);
      return data;
    },

    async createScreenshotSet(localizationId, displayType) {
      const { data } = await request("/appScreenshotSets", {
        method: "POST",
        body: {
          data: {
            type: "appScreenshotSets",
            attributes: { screenshotDisplayType: displayType },
            relationships: {
              appStoreVersionLocalization: {
                data: { type: "appStoreVersionLocalizations", id: localizationId },
              },
            },
          },
        },
      });
      return data;
    },

    async deleteScreenshot(screenshotId) {
      await request(`/appScreenshots/${screenshotId}`, { method: "DELETE" });
    },

    /** Reserves a slot and returns the upload operations Apple wants the bytes sent to. */
    async reserveScreenshot({ setId, fileName, fileSize }) {
      const { data } = await request("/appScreenshots", {
        method: "POST",
        body: {
          data: {
            type: "appScreenshots",
            attributes: { fileName, fileSize },
            relationships: {
              appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } },
            },
          },
        },
      });
      return data;
    },

    /** Uploads follow Apple's own instructions: one PUT per operation, in order. */
    async uploadBytes(operations, buffer) {
      for (const operation of operations) {
        const headers = Object.fromEntries((operation.requestHeaders ?? []).map((h) => [h.name, h.value]));
        const chunk = buffer.subarray(operation.offset, operation.offset + operation.length);
        const response = await fetchImpl(operation.url, { method: operation.method, headers, body: chunk });
        if (!response.ok) {
          throw new Error(`Uploading bytes failed: ${await describeFailure(response)}`);
        }
      }
    },

    async commitScreenshot(screenshotId, checksum) {
      const { data } = await request(`/appScreenshots/${screenshotId}`, {
        method: "PATCH",
        body: {
          data: {
            type: "appScreenshots",
            id: screenshotId,
            attributes: { uploaded: true, sourceFileChecksum: checksum },
          },
        },
      });
      return data;
    },
  };
}
