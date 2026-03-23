import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = params.email as string;
        if (!email.endsWith("@bi.no")) {
          throw new ConvexError("Kun @bi.no e-postadresser er tillatt");
        }
        return {
          email,
          name: email.split("@")[0],
        };
      },
      validatePasswordRequirements(password: string) {
        if (password.length < 8) {
          throw new ConvexError("Passordet må være minst 8 tegn");
        }
      },
    }),
  ],
});
