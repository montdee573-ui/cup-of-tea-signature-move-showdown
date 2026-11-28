import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";
import type { VerifiedApplicant } from "./promoter-registration";

export async function verifiedPromoterIdentity(req: Request): Promise<VerifiedApplicant | null> {
  const auth = getAuth(req);
  if (!auth.userId || !auth.sessionClaims?.iss) return null;
  const user = await clerkClient.users.getUser(auth.userId);
  const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  if (primaryEmail?.verification?.status !== "verified") return null;
  return { issuer: auth.sessionClaims.iss, subject: auth.userId, verified: true };
}
