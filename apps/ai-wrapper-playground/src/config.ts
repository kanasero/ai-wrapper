import dotenv from "dotenv";

dotenv.config();

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not defined in .env");
}

if (!process.env.OPENROUTER_DEFAULT_MODEL) {
  throw new Error("OPENROUTER_DEFAULT_MODEL is not defined in .env");
}

export const config = {
  apiKey: process.env.OPENROUTER_API_KEY as string,
  defaultModel: process.env.OPENROUTER_DEFAULT_MODEL as string,
};
