import type { Role } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /// Student.id or Teacher.id for those roles; null for admins.
      profileId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    profileId?: string | null;
  }
}

// `next-auth/jwt` only re-exports from `@auth/core/jwt`, so the augmentation
// has to target the module that actually declares the interface.
declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    profileId?: string | null;
  }
}

export {};
