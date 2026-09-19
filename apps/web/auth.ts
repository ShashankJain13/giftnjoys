import { resolve } from 'node:path';
import NextAuth from 'next-auth';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';

// This route handler's module graph is evaluated before next.config.ts's repo-root env loading
// reaches it in dev, so AUTH_SECRET etc. read as undefined without this. No-op in AWS, where
// these are injected directly as Lambda env vars and no .env.local file exists.
try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env.local'));
} catch {
  /* optional */
}

const SERVER_API = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

interface AccountUpsertResponse {
  token: string;
  account: {
    id: string;
    savedAddress: { phone: string; address1: string; address2: string; city: string; state: string; pincode: string } | null;
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, Facebook],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    // `user`/`account` are only populated right after a fresh sign-in — everything is cached on
    // the token after that, so this doesn't hit public-api on every request.
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        try {
          const res = await fetch(`${SERVER_API}/v1/accounts/oauth`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
            body: JSON.stringify({ email: user.email, name: user.name ?? user.email, avatarUrl: user.image, provider: account.provider }),
          });
          if (res.ok) {
            const data = (await res.json()) as AccountUpsertResponse;
            token.accountId = data.account.id;
            token.accountToken = data.token;
            token.savedAddress = data.account.savedAddress ?? undefined;
          }
        } catch {
          // Sign-in still succeeds without an account link — worst case, checkout falls back to guest.
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accountId = token.accountId;
      session.accountToken = token.accountToken;
      session.savedAddress = token.savedAddress;
      return session;
    },
  },
});
