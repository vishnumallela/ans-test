import { Elysia } from "elysia";
import { z } from "zod";

export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
});

export type ErrorResponseType = z.infer<typeof ErrorResponse>;

export const standardErrors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
  422: ErrorResponse,
  429: ErrorResponse,
  500: ErrorResponse,
} as const satisfies Record<number, z.ZodTypeAny>;

export const errorHandler = new Elysia({ name: "error-handler" })
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error:", code, errorMessage);
    const createErrorResponse = (status: number, message: string) => {
      set.status = status;
      return Response.json(
        { success: false, error: message },
        { status, headers: { 'Connection': 'close' } }
      );
    };

    if (code === "NOT_FOUND") {
      return createErrorResponse(404, "Route not found");
    }

    if (code === "VALIDATION") {
      return createErrorResponse(400, errorMessage);
    }

    if (code === "PARSE") {
      return createErrorResponse(400, "Invalid request format");
    }

    if (error instanceof Error && error.cause) {
      switch (error.cause) {
        case "BAD_REQUEST": return createErrorResponse(400, errorMessage);
        case "UNAUTHORIZED": return createErrorResponse(401, errorMessage || "Unauthorized");
        case "FORBIDDEN": return createErrorResponse(403, errorMessage || "Forbidden");
        case "CONFLICT": return createErrorResponse(409, errorMessage || "Conflict");
        case "UNPROCESSABLE_ENTITY": return createErrorResponse(422, errorMessage || "Unprocessable entity");
        case "TOO_MANY_REQUESTS": return createErrorResponse(429, errorMessage || "Too many requests");
      }
    }

    return createErrorResponse(500, errorMessage || "Internal server error");
  });

export const throwError = (
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500, 
  message: string
): never => {
  const error = new Error(message);
  
  switch (status) {
    case 400: error.cause = "BAD_REQUEST"; break;
    case 401: error.cause = "UNAUTHORIZED"; break;
    case 403: error.cause = "FORBIDDEN"; break;
    case 404: error.cause = "NOT_FOUND"; break;
    case 409: error.cause = "CONFLICT"; break;
    case 422: error.cause = "UNPROCESSABLE_ENTITY"; break;
    case 429: error.cause = "TOO_MANY_REQUESTS"; break;
  }
  
  throw error;
};