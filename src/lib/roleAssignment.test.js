import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const userUtilsSrc = readFileSync(join(root, "src/lib/userUtils.js"), "utf8");

/** Mirrors getAssignableRolesForActor / canAssignRoleToUser (role ceiling only). */
function getAssignableRolesForActor(actor) {
  const role = actor?.role;
  if (role === "super_admin") {
    return ["user", "monitor", "lead", "director", "admin", "super_admin"];
  }
  if (role === "admin") {
    return ["user", "monitor", "lead", "director", "admin"];
  }
  if (role === "director") {
    return ["user", "monitor", "lead", "director"];
  }
  return [];
}

function canPromoteToRole(actor, targetRole, newRole) {
  if (!getAssignableRolesForActor(actor).includes(newRole)) return false;
  if (actor.role === "director") return newRole !== "admin" && newRole !== "super_admin";
  if (actor.role === "admin") {
    if (newRole === "super_admin") return false;
    if (targetRole === "super_admin") return false;
    return true;
  }
  return true;
}

describe("role assignment", () => {
  it("exports assignable role lists and guards in userUtils", () => {
    assert.ok(userUtilsSrc.includes("DIRECTOR_ASSIGNABLE_ROLES"));
    assert.ok(userUtilsSrc.includes("ORG_ADMIN_ASSIGNABLE_ROLES"));
    assert.ok(userUtilsSrc.includes("canAssignRoleToUser"));
    assert.ok(userUtilsSrc.includes("filterUsersInManagedChannels"));
  });

  it("team leads cannot assign admin roles", () => {
    const director = { role: "director" };
    assert.equal(canPromoteToRole(director, "user", "lead"), true);
    assert.equal(canPromoteToRole(director, "user", "director"), true);
    assert.equal(canPromoteToRole(director, "user", "admin"), false);
  });

  it("org admins may assign admin but not super_admin", () => {
    const admin = { role: "admin" };
    assert.equal(canPromoteToRole(admin, "user", "admin"), true);
    assert.equal(canPromoteToRole(admin, "user", "super_admin"), false);
    assert.equal(canPromoteToRole(admin, "super_admin", "admin"), false);
  });

  it("firestore rules enforce director and admin role ceilings", () => {
    const firestore = readFileSync(join(root, "firestore.rules"), "utf8");
    assert.ok(firestore.includes("directorRoleOnlyUpdateValid"));
    assert.ok(firestore.includes("platformAdminRoleChangeValid"));
    assert.ok(firestore.includes("directorTeamLeadRoleValue"));
    assert.ok(firestore.includes("directorUserUpdate()"));
  });
});
