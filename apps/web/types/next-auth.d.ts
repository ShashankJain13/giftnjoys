import type { DefaultSession } from 'next-auth';

interface AccountSavedAddress {
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
}

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accountId?: string;
    /** Bearer token for this shopper's own public-api account endpoints — scoped, not a Google/Facebook credential. */
    accountToken?: string;
    savedAddress?: AccountSavedAddress;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    accountId?: string;
    accountToken?: string;
    savedAddress?: AccountSavedAddress;
  }
}
