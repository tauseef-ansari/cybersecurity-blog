
import type { APIRoute } from "astro";
import { COOKIE_NAME } from "../../lib/vault-auth";

export const prerender = false;

export const POST: APIRoute = ({ cookies, request, redirect }) => {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;

  if (origin !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  cookies.delete(COOKIE_NAME, { path: "/vault" });

  const response = redirect("/vault/login", 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
};

