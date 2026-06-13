import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import { updateConversationSchema } from "@/api/hono/schemas/conversations";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import {
  createEmptyConversation,
  deleteConversation,
  getConversation,
  listConversationsForUser,
  updateConversationTitle,
} from "@/db/queries/conversations";

export const registerConversationRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // List conversations for current user
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Conversation list" },
      },
      tags: ["Conversations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rows = await listConversationsForUser(adminOrResponse.id);
      const summaries = rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        productId: row.productId,
      }));
      return c.json(summaries, 200);
    },
  );

  // Get a single conversation
  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Conversation detail" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Conversations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const conversation = await getConversation(id, adminOrResponse.id);
      if (!conversation) {
        return c.json(
          { code: "NOT_FOUND", message: "Conversation not found." },
          404,
        );
      }

      return c.json(
        {
          id: conversation.id,
          messages: conversation.messages,
          productId: conversation.productId,
        },
        200,
      );
    },
  );

  // Create empty conversation
  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      responses: {
        201: { description: "Conversation created" },
      },
      tags: ["Conversations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const result = await createEmptyConversation(adminOrResponse.id);
      return c.json(result, 201);
    },
  );

  // Update conversation title
  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: updateConversationSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Title updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Conversations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const { title } = c.req.valid("json");
      const updated = await updateConversationTitle(
        id,
        adminOrResponse.id,
        title,
      );
      if (!updated) {
        return c.json(
          { code: "NOT_FOUND", message: "Conversation not found." },
          404,
        );
      }

      return c.json({ success: true }, 200);
    },
  );

  // Delete conversation
  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Conversation deleted" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Conversations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const deleted = await deleteConversation(id, adminOrResponse.id);
      if (!deleted) {
        return c.json(
          { code: "NOT_FOUND", message: "Conversation not found." },
          404,
        );
      }

      return c.json({ success: true }, 200);
    },
  );
};
