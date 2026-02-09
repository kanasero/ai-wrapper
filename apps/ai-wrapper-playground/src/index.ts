import { AIWrapper } from "@kanasero/ai-wrapper";
import { config } from "./config";

async function main() {
  const ai = new AIWrapper({
    apiKey: config.apiKey,
    defaultModel: config.defaultModel,
  });

  console.log(
    await ai.ask({
      message:
        "Напиши перевод предложения на английский: 'Привет как дела?'. Больше ничего не выводи в ответе.",
    }),
  );
}

main();
