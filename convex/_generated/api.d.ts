/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatSessions from "../chatSessions.js";
import type * as chunks from "../chunks.js";
import type * as companies from "../companies.js";
import type * as documents from "../documents.js";
import type * as financialMetrics from "../financialMetrics.js";
import type * as http from "../http.js";
import type * as users from "../users.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chatMessages: typeof chatMessages;
  chatSessions: typeof chatSessions;
  chunks: typeof chunks;
  companies: typeof companies;
  documents: typeof documents;
  financialMetrics: typeof financialMetrics;
  http: typeof http;
  users: typeof users;
  watchlist: typeof watchlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
