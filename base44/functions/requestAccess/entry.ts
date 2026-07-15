import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { email, first_name, last_name, organization } = body;

    if (!email || !first_name || !organization) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch all admin users to notify them
    const users = await base44.asServiceRole.entities.User.list();
    const admins = users.filter(u => u.role === "admin");
    const adminEmails = admins.map(a => a.email).filter(Boolean);

    if (adminEmails.length === 0) {
      return Response.json({ error: "No admins configured" }, { status: 500 });
    }

    const fullName = [first_name, last_name].filter(Boolean).join(" ");

    for (const adminEmail of adminEmails) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: adminEmail,
        subject: "New Access Request - Presence Torch",
        body: `${fullName} (${email}) is requesting access to Presence Torch.\n\nOrganization: ${organization}\n\nTo approve, go to the Admin page in the app and invite ${email} as a user.`,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});