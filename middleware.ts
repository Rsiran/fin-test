import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

const isPublicPage = createRouteMatcher(["/login", "/signup"]);
const isPublicApi = createRouteMatcher(["/api/admin/(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isPublic = isPublicPage(request) || isPublicApi(request);
  if (!isPublic && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
  // Only redirect authenticated users away from login/signup pages, not API routes
  if (isPublicPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
