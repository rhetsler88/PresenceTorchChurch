const GIS_SRC = "https://accounts.google.com/gsi/client";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";
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
      scope: `${DOCS_SCOPE} ${DRIVE_FILE_SCOPE}`,
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

async function docsFetch(path, accessToken, options = {}) {
  const res = await fetch(`https://docs.googleapis.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || res.statusText || "Google Docs request failed";
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

/**
 * Creates a Google Doc in the signed-in user's Drive and inserts transcript content.
 * Uses Google Identity Services (user OAuth) — service accounts cannot own Drive files.
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
  const created = await docsFetch("/documents", accessToken, {
    method: "POST",
    body: JSON.stringify({ title: docTitle }),
  });

  const documentId = created?.documentId;
  if (!documentId) {
    throw new Error("Google Docs did not return a document id");
  }

  await docsFetch(`/documents/${documentId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: content,
          },
        },
      ],
    }),
  });

  return {
    documentId,
    url: `https://docs.google.com/document/d/${documentId}/edit`,
  };
}
