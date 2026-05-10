import { drizzle } from "drizzle-orm/postgres-js";
import { schema } from "./schema";
import { relations } from "./realtions";

export const db = drizzle(process.env.DATABASE_URL!, { schema, relations });
