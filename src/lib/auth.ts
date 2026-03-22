import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabase } from "./supabase";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const { error } = await supabase.from("users").upsert(
          {
            google_id: account.providerAccountId,
            email: user.email,
            name: user.name ?? null,
            google_access_token: account.access_token ?? null,
            google_refresh_token: account.refresh_token ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "google_id" }
        );
        if (error) {
          console.error("Failed to upsert user in Supabase:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : null;
        token.googleId = account.providerAccountId;
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("google_id", account.providerAccountId)
          .single();
        token.supabaseUserId = data?.id ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.googleId = token.googleId as string | undefined;
      session.supabaseUserId = token.supabaseUserId as string | undefined;
      return session;
    },
  },
});
