import React from "react";
import { Link } from "react-router-dom";
import LegalPageLayout from "@/components/legal/LegalPageLayout";

const LAST_UPDATED = "July 28, 2026";

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        Presence Torch (&quot;Presence Torch,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides
        push-to-talk communication tools for organizations and their members. This Privacy Policy
        describes how we collect, use, store, and share information when you use our web and mobile
        applications (the &quot;Service&quot;).
      </p>

      <h2>1. Information we collect</h2>
      <h3>Account information</h3>
      <ul>
        <li>Name, email address, and organization affiliation</li>
        <li>Authentication credentials (passwords are handled by Firebase Authentication; we do not store plain-text passwords)</li>
        <li>Profile details you provide during onboarding</li>
        <li>Role and channel membership assigned by your organization</li>
      </ul>

      <h3>Communications and content</h3>
      <ul>
        <li>Voice messages, live push-to-talk audio, and text messages you send in channels</li>
        <li>Transcripts generated from voice messages</li>
        <li>Channel activity metadata (timestamps, sender, channel, device time/date)</li>
      </ul>

      <h3>Device and usage information</h3>
      <ul>
        <li>Device type, browser, and app version</li>
        <li>Push notification tokens (if you enable notifications)</li>
        <li>Session information, including login time and session duration</li>
        <li>Security signals such as reCAPTCHA verification during sign-in</li>
      </ul>

      <h3>Optional features</h3>
      <ul>
        <li>Biometric sign-in preferences on supported mobile devices (stored locally on your device)</li>
        <li>Google account authorization when you choose Google sign-in or export transcripts to Google Docs</li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>Provide push-to-talk messaging, channel access, and organization administration</li>
        <li>Transmit live audio and deliver voice messages to authorized channel members</li>
        <li>Generate and display transcripts of voice messages</li>
        <li>Send push notifications for alerts and channel activity you are authorized to receive</li>
        <li>Authenticate users, prevent abuse, and protect the Service</li>
        <li>Maintain audit logs and transcript history according to organizational retention settings</li>
        <li>Improve reliability, security, and performance of the Service</li>
      </ul>

      <h2>3. How we share information</h2>
      <p>We do not sell your personal information. We may share information in these situations:</p>
      <ul>
        <li>
          <strong>Within your organization:</strong> Messages and transcripts are visible to members
          and administrators according to channel permissions and protection levels.
        </li>
        <li>
          <strong>Service providers:</strong> We use trusted third parties to operate the Service,
          including Google Firebase (authentication, database, storage, cloud functions), Agora
          (real-time audio), Google Cloud Speech (transcription), and Google reCAPTCHA (bot protection).
        </li>
        <li>
          <strong>Google Docs export:</strong> If you export transcripts, content is created in the
          Google account you authorize. We do not receive your Google Drive files beyond that export action.
        </li>
        <li>
          <strong>Legal requirements:</strong> We may disclose information if required by law or to
          protect the rights, safety, and security of users and the Service.
        </li>
      </ul>

      <h2>4. Data retention</h2>
      <ul>
        <li>Voice messages and transcripts are retained for a limited period (currently up to 15 days), after which they are automatically deleted from our systems.</li>
        <li>Account information is kept while your account is active.</li>
        <li>You may request account deletion through the app, which removes your profile and associated data subject to organizational and legal requirements.</li>
      </ul>

      <h2>5. Security</h2>
      <p>
        We use industry-standard safeguards including encrypted connections (HTTPS), Firebase security
        rules, role-based access controls, and authenticated API access. No method of transmission or
        storage is completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>6. Your choices and rights</h2>
      <ul>
        <li>Update profile information in the app where available</li>
        <li>Disable push notifications in your device settings</li>
        <li>Delete your account from profile settings</li>
        <li>Contact your organization administrator for access or membership questions</li>
      </ul>
      <p>
        Depending on your location, you may have additional rights to access, correct, or delete personal
        information. Contact your organization administrator to submit requests related to data we process
        on their behalf.
      </p>

      <h2>7. Children&apos;s privacy</h2>
      <p>
        The Service is intended for use by organizations and their authorized members. It is not directed
        to children under 13, and we do not knowingly collect personal information from children under 13.
      </p>

      <h2>8. International users</h2>
      <p>
        Your information may be processed in the United States and other countries where our service
        providers operate. By using the Service, you consent to this processing.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will revise the &quot;Last updated&quot; date
        when changes are posted. Continued use of the Service after changes constitutes acceptance of the
        updated policy.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy questions, contact your organization administrator or the Presence Torch support
        contact designated by your organization.
      </p>
      <p>
        See also our <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalPageLayout>
  );
}
