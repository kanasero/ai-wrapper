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
  useCache?: boolean;
}

export class AIWrapper {
  #cacheDir: string;
  #logDir: string;
  #DEFAULT_AI_REQUEST: { [key: string]: any };
  #config: AIWrapperConfig;

  constructor(config: AIWrapperConfig) {
    this.#config = config;

    this.#cacheDir = path.join(process.cwd(), config.cacheDir ?? "llm-cache");
    if (!fs.existsSync(this.#cacheDir)) fs.mkdirSync(this.#cacheDir);

    this.#logDir = path.join(process.cwd(), config.logDir ?? "llm-log");
    if (!fs.existsSync(this.#logDir)) fs.mkdirSync(this.#logDir);

    this.#DEFAULT_AI_REQUEST = {
      ifUseCache: config.useCache ?? true,
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
    return openai.chat.completions
      .create({
        model,
        messages,
        response_format: {
          type: "json_object",
        },
      })
      .then((response) => {
        if (response.choices.length === 0 || !response.choices[0])
          throw new Error("No inference from LLM");
        if (response.choices[0].message.content === null) {
          throw new Error("LLM response is null");
        } else {
          const responseContent = response.choices[0].message.content
            .trim()
            .replace(/<think>.+<\/think>/s, "")
            .trim()
            .replace(/^```(?:json)?(.+)```$/s, "$1")
            .trim();
          this.#writeToCache(cachedFile, responseContent);
          return responseContent;
        }
      })
      .catch((error: string) => {
        const logPath = path.join(this.#logDir, "llm-error.log");
        const time = new Date().toISOString();
        const historyText = finalRequest.history
          ? finalRequest.history.map((item) => item.content).join("\n\t")
          : "";
        fs.writeFileSync(
          logPath,
          `${time} ${error}\n\t${finalRequest.message}\n\t${historyText}\n`,
        );
        throw new Error(error);
      });
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
