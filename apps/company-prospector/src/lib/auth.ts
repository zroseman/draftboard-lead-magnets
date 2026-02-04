import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getOrCreateUser } from './db';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await getOrCreateUser(user.email, user.name || undefined, user.image || undefined);
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await getOrCreateUser(session.user.email);
        session.user.id = dbUser.id.toString();
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
