export const CHATGPT_DOM = Object.freeze({
  newChat: 'a[data-testid="create-new-chat-button"][href="/"]',
  composer: 'form[data-type="unified-composer"]',
  prompt:
    'form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"][role="textbox"]',
  upload:
    'form[data-type="unified-composer"] input#upload-files[type="file"][multiple]',
  attach:
    'form[data-type="unified-composer"] button#composer-plus-btn[data-testid="composer-plus-btn"]',
  modelTrigger:
    'form[data-type="unified-composer"] button[aria-haspopup="menu"]',
  checkedModel: '[role="menuitemradio"][aria-checked="true"]',
  proModel: '[role="menuitemradio"]',
  send:
    'form[data-type="unified-composer"] button#composer-submit-button[data-testid="send-button"]',
  stop: 'button#composer-submit-button[data-testid="stop-button"]',
  thinking: ".loading-shimmer-tertiary",
});

export async function probeChatGptDom(tab, options = {}) {
  const expectedModel = options.expectedModel || "Pro";
  return tab.playwright.evaluate(
    ({ selectors, expected }) => {
      const visible = (element) =>
        !!element && element.getClientRects().length > 0;
      const main = document.querySelector("main");
      const composer = document.querySelector(selectors.composer);
      const modelTriggers = Array.from(
        document.querySelectorAll(selectors.modelTrigger),
      ).filter(visible);
      const modelTrigger = modelTriggers.find(
        (element) => (element.textContent || "").trim() === expected,
      );
      const checkedModels = Array.from(
        document.querySelectorAll(selectors.checkedModel),
      )
        .filter(visible)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      const thinkingLabels = Array.from(
        document.querySelectorAll(selectors.thinking),
      )
        .filter(visible)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      const send = document.querySelector(selectors.send);
      const state = {
        url: location.href,
        title: document.title,
        main: !!main,
        newChat: document.querySelectorAll(selectors.newChat).length > 0,
        composer: !!composer,
        prompt: !!document.querySelector(selectors.prompt),
        upload: !!document.querySelector(selectors.upload),
        attach: !!document.querySelector(selectors.attach),
        expectedModel: expected,
        modelSelected:
          !!modelTrigger ||
          checkedModels.some((model) => model === expected),
        modelTriggerText: modelTrigger
          ? (modelTrigger.textContent || "").trim()
          : null,
        checkedModels,
        sendPresent: !!send,
        sendEnabled: !!send && !send.disabled,
        stopPresent: !!document.querySelector(selectors.stop),
        thinkingActive: thinkingLabels.length > 0,
        thinkingLabels: thinkingLabels.slice(-3),
      };
      return {
        ok:
          state.main &&
          state.composer &&
          state.prompt &&
          state.upload &&
          state.attach &&
          state.modelSelected,
        state,
      };
    },
    { selectors: CHATGPT_DOM, expected: expectedModel },
    { timeoutMs: 10000 },
  );
}

export function assertFreshProComposer(probe) {
  if (!probe?.ok) {
    throw new Error(
      `ChatGPT DOM contract failed: ${JSON.stringify(probe?.state || null)}`,
    );
  }
  if (probe.state.stopPresent || probe.state.thinkingActive) {
    throw new Error("ChatGPT tab is not a fresh idle Pro composer");
  }
  return probe;
}
