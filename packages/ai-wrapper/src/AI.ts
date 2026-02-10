import fs from "fs";
import { hash } from "node:crypto";
import OpenAI from "openai";
import path from "path";
import { AIMessage, AIMessageRole, AIRequest } from "./models/ai.model.js";

export interface AIWrapperConfig {
  apiKey: string;
  defaultModel: string;
  cacheDir?: string;
  logDir?: string;
  ifUseCache?: boolean;
  ifValidateJSON?: boolean;
  ifDebugLog?: boolean;
}

export class AIWrapper {
  #cacheDir: string;
  #logDir: string;
  #DEFAULT_AI_REQUEST: { [key: string]: any };
  #config: AIWrapperConfig;
  readonly #AI_MAX_RETRIES = 3;

  constructor(config: AIWrapperConfig) {
    this.#config = config;

    this.#cacheDir = path.join(process.cwd(), config.cacheDir ?? "llm-cache");
    if (!fs.existsSync(this.#cacheDir)) fs.mkdirSync(this.#cacheDir);

    this.#logDir = path.join(process.cwd(), config.logDir ?? "llm-log");
    if (!fs.existsSync(this.#logDir)) fs.mkdirSync(this.#logDir);

    this.#DEFAULT_AI_REQUEST = {
      ifUseCache: config.ifUseCache ?? true,
      ifValidateSON: config.ifValidateJSON ?? true,
    };
  }

  async ask(request: AIRequest) {
    const finalRequest = { ...this.#DEFAULT_AI_REQUEST, ...request };

    const model = request.model ?? this.#config.defaultModel;

    let messages: AIMessage[] = [
      {
        role: AIMessageRole.user,
        content: finalRequest.message,
      },
    ];
    if (finalRequest.history) {
      messages = [...finalRequest.history, ...messages];
    }

    const cachedFile = this.#getCacheFilePath(messages, model);
    if (finalRequest.ifUseCache && fs.existsSync(cachedFile)) {
      return Promise.resolve(fs.readFileSync(cachedFile).toString());
    }

    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: this.#config.apiKey,
    });

    const totalAttempts = this.#AI_MAX_RETRIES + 1;
    let attempt = 0;
    let lastError: unknown;

    do {
      attempt++;
      try {
        if (this.#config.ifDebugLog) {
          if (attempt > 1) {
            console.log(`Retrying request ${model}, attemp ${attempt}`);
          } else {
            console.log(`Requesting ${model}`);
          }
        }
        const response = await openai.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
        });

        if (response.choices.length === 0 || !response.choices[0]) {
          throw new Error("No inference from LLM");
        }

        const content = response.choices[0].message.content;
        if (content === null) throw new Error("LLM response is null");

        const responseContent = content
          .trim()
          .replace(/<think>.+<\/think>/s, "")
          .trim()
          .replace(/^```(?:json)?(.+)```$/s, "$1")
          .trim();

        if (finalRequest.ifValidateJSON) {
          JSON.parse(responseContent);
        }

        this.#writeToCache(cachedFile, responseContent);
        return responseContent;
      } catch (err) {
        lastError = err;

        const logPath = path.join(this.#logDir, "llm-error.log");
        const time = new Date().toISOString();
        const historyText = finalRequest.history
          ? finalRequest.history.map((item) => item.content).join("\n\t")
          : "";
        const msg = err instanceof Error ? err.message : String(err);

        fs.writeFileSync(
          logPath,
          `${time} [attempt ${attempt}/${totalAttempts}] ${msg}\n\t${finalRequest.message}\n` +
            (historyText ? `\t${historyText}\n` : ""),
          { flag: "a" },
        );

        if (attempt >= totalAttempts) break;
      }
    } while (attempt < this.#AI_MAX_RETRIES);
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  #getCacheFilePath(uid: string | object, model: string) {
    const modelDirectory = model.replace(/[^a-z0-9-]/g, "");
    const uidString = typeof uid === "string" ? uid : JSON.stringify(uid);
    const uidHash = hash("md5", uidString, "hex");
    return path.join(this.#cacheDir, modelDirectory, uidHash);
  }

  #writeToCache(file: string, content: string) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    fs.writeFileSync(file, content);
  }
}
