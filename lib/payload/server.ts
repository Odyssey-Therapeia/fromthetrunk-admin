import "server-only";

import { getPayload } from "payload";

import config from "@/payload.config";
import { importMap } from "@/payload/importMap";

export const getPayloadClient = () => getPayload({ config, importMap });
