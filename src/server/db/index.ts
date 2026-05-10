import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schema } from "./schema";
import { relations } from "./realtions";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema, relations });
