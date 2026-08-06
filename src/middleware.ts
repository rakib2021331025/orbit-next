import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Middleware runs on the edge runtime, so it uses only the provider-less
// config. Route authorisation is decided from the JWT alone — no DB round-trip.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    // Everything except static assets, images and the auth API itself.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
