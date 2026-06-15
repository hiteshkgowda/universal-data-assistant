import { withAuth } from "next-auth/middleware";

// Next.js 16+ uses "proxy.ts" as the middleware file convention.
// This file protects every route except the auth endpoints and static assets.
const proxy = withAuth({ pages: { signIn: "/auth/signin" } });
export default proxy;

export const config = {
  matcher: [
    /*
     * Protect every route except:
     *  - /auth/* (sign-in page)
     *  - /api/auth/* (NextAuth endpoints — must be public for the OAuth callback)
     *  - /_next/* (Next.js internals)
     *  - Static files — anything with a file extension (images, fonts, icons, etc.)
     */
    "/((?!auth/|api/auth/|_next/|[^/]+\\.[^/]+$).*)",
  ],
};
