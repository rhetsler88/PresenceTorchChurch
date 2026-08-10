const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function getClientId() {
  const fromEnv = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  // Firebase web client (client_type 3) from google-services.json
  return "956501692008-lj14r06gtrg12034uoo362k4qhmfen99.apps.googleusercontent.com";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in"));
    document.head.appendChild(script);
  });
}

function waitForGis() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tick = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      attempts += 1;
      if (attempts > 40) {
        reject(new Error("Google sign-in did not initialize"));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

function requestAccessToken(clientId, prompt = "") {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error) {
          if (response.error === "interaction_required" && prompt !== "consent") {
            requestAccessToken(clientId, "consent").then(resolve).catch(reject);
            return;
          }
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt });
  });
}

async function createGoogleDocViaDrive({ title, content, accessToken }) {
  const metadata = {
    name: title,
    mimeType: "application/vnd.google-apps.document",
  };

  const boundary = `presence_torch_${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || res.statusText || "Google Drive request failed";
    throw new Error(message);
  }

  return res.json();
}

/**
 * Creates a Google Doc in the signed-in user's Drive and inserts transcript content.
 * Uses Drive API (drive.file scope) — non-sensitive OAuth, no Docs API required.
 */
export async function exportContentToGoogleDoc({ title, content }) {
  if (!content?.trim()) {
    throw new Error("Nothing to export");
  }

  await loadScript(GIS_SRC);
  await waitForGis();

  const clientId = getClientId();
  const accessToken = await requestAccessToken(clientId);

  const docTitle = (title || "Presence Torch Transcript Log").trim().slice(0, 200);
  const created = await createGoogleDocViaDrive({
    title: docTitle,
    content,
    accessToken,
  });

  const documentId = created?.id;
  if (!documentId) {
    throw new Error("Google Drive did not return a document id");
  }

  return {
    documentId,
    url: created.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
  };
}
