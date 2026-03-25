/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatSessions from "../chatSessions.js";
import type * as chunks from "../chunks.js";
import type * as cleanup from "../cleanup.js";
import type * as cleanupActions from "../cleanupActions.js";
import type * as companies from "../companies.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as feedback from "../feedback.js";
import type * as feedbackActions from "../feedbackActions.js";
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
  admin: typeof admin;
  auth: typeof auth;
  chatMessages: typeof chatMessages;
  chatSessions: typeof chatSessions;
  chunks: typeof chunks;
  cleanup: typeof cleanup;
  cleanupActions: typeof cleanupActions;
  companies: typeof companies;
  crons: typeof crons;
  documents: typeof documents;
  feedback: typeof feedback;
  feedbackActions: typeof feedbackActions;
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
