import React from "react";
import { Link } from "react-router-dom";
import LegalPageLayout from "@/components/legal/LegalPageLayout";

const LAST_UPDATED = "July 30, 2026";

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Presence Torch
        (&quot;Presence Torch,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) web and mobile
        applications (the &quot;Service&quot;). By accessing or using the Service, you agree to these Terms.
      </p>

      <h2>1. Who may use the Service</h2>
      <ul>
        <li>The Service is provided to organizations and their authorized members.</li>
        <li>You must have a valid account approved by your organization to use most features.</li>
        <li>You must be at least 13 years old (or the minimum age required in your jurisdiction) to use the Service.</li>
        <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
      </ul>

      <h2>2. Organization accounts and access</h2>
      <p>
        Your organization controls channel membership, roles, and permissions. Administrators and directors
        may assign access, monitor channels, manage protection levels, and remove members according to
        organizational policies.
      </p>
      <p>
        We may suspend or terminate access if requested by your organization or if we reasonably believe
        you have violated these Terms or applicable law.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for unlawful, harassing, abusive, or harmful purposes</li>
        <li>Transmit content that infringes intellectual property or privacy rights of others</li>
        <li>Attempt to gain unauthorized access to channels, accounts, or systems</li>
        <li>Interfere with or disrupt the Service, including live audio or push-to-talk systems</li>
        <li>Circumvent security controls, daily access codes, or channel protection levels</li>
        <li>Record, export, or share communications outside authorized organizational use without permission</li>
        <li>Use automated tools to scrape, spam, or overload the Service</li>
      </ul>

      <h2>4. Communications and content</h2>
      <ul>
        <li>You retain ownership of content you submit, but grant us and your organization the rights necessary to operate the Service (store, transmit, transcribe, display, and back up content).</li>
        <li>Live and recorded voice communications may be transcribed automatically.</li>
        <li>Transcripts and messages may be visible to other authorized members and administrators based on channel settings.</li>
        <li>You are solely responsible for the content you transmit through the Service.</li>
      </ul>

      <h2>5. Session and account security</h2>
      <ul>
        <li>Sessions may automatically expire after a period of inactivity or maximum session length.</li>
        <li>Closing the browser tab or app window may end your session on web clients.</li>
        <li>You may enable biometric sign-in on supported devices at your own discretion.</li>
        <li>Notify your administrator immediately if you suspect unauthorized access to your account.</li>
      </ul>

      <h2>6. Third-party services</h2>
      <p>
        The Service integrates with third-party providers such as Google (authentication, reCAPTCHA, Docs
        export), Firebase, and Agora. Your use of those features may be subject to the third party&apos;s
        terms and privacy policies.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        Presence Torch, including its software, branding, and documentation, is owned by us or our
        licensors and is protected by applicable intellectual property laws. These Terms do not grant
        you any rights to our trademarks or branding except as needed to use the Service.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
        WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
        ERROR-FREE, OR SECURE AT ALL TIMES.
      </p>
      <p>
        Push-to-talk and live audio depend on network conditions and third-party infrastructure. We are
        not responsible for delays, dropped audio, or failed deliveries caused by factors outside our
        reasonable control.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, PRESENCE TORCH AND ITS AFFILIATES, OFFICERS, EMPLOYEES,
        AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
        DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.
      </p>
      <p>
        OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE
        GREATER OF (A) THE AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM OR
        (B) ONE HUNDRED U.S. DOLLARS ($100).
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Presence Torch from claims, damages, and expenses
        (including reasonable legal fees) arising from your use of the Service, your content, or your
        violation of these Terms or applicable law.
      </p>

      <h2>11. Termination</h2>
      <p>
        You may stop using the Service at any time. You may delete your account through in-app settings.
        We or your organization may suspend or terminate your access for violations of these Terms or for
        operational, security, or legal reasons.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may modify these Terms from time to time. If we make material changes, we will update the
        &quot;Last updated&quot; date. Continued use of the Service after changes become effective
        constitutes acceptance of the revised Terms.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Ohio, without regard to
        conflict-of-law principles, except where prohibited by applicable local law.
      </p>

      <h2>14. Contact</h2>
      <p>
        For questions about these Terms, contact your organization administrator or the Presence Torch
        support contact designated by your organization.
      </p>
      <p>
        See also our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPageLayout>
  );
}
