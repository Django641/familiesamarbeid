import { redirect } from "next/navigation";

// Innloggede sendes til /hjem av proxy.ts, andre til /login. Dette er bare en fallback.
export default function RootPage() {
  redirect("/hjem");
}
