const assert = require("node:assert/strict");
const test = require("node:test");

const { inferConversationTurnRole, selectNewAssistantImage } = require("../lib/chatgpt-generated-image");

test("infers the current ChatGPT image-result turn as assistant", () => {
  assert.equal(inferConversationTurnRole({
    ownRole: null,
    userMarkerCount: 1,
    assistantMarkerCount: 0,
    readyImageCount: 1
  }), "user");

  assert.equal(inferConversationTurnRole({
    ownRole: null,
    userMarkerCount: 0,
    assistantMarkerCount: 0,
    readyImageCount: 3
  }), "assistant");
});

test("ignores the uploaded reference image and old assistant turns", () => {
  const baselineTurnKeys = new Set(["conversation-turn-2"]);
  const turns = [
    {
      turnKey: "conversation-turn-1",
      authorRole: "user",
      images: [{ src: "https://cdn.example/reference-uploaded.png", id: "reference" }]
    },
    {
      turnKey: "conversation-turn-2",
      authorRole: "assistant",
      images: [{ src: "https://cdn.example/old-result-new-url.png", id: "old-result" }]
    },
    {
      turnKey: "conversation-turn-3",
      authorRole: "assistant",
      images: [{ src: "https://cdn.example/generated-result.png", id: "new-result" }]
    }
  ];

  const selected = selectNewAssistantImage(turns, baselineTurnKeys);
  assert.equal(selected.id, "new-result");
});

test("waits when only the user reference image has appeared", () => {
  const turns = [{
    turnKey: "conversation-turn-1",
    authorRole: "user",
    images: [{ src: "blob:https://chatgpt.com/reference", id: "reference" }]
  }];

  assert.equal(selectNewAssistantImage(turns, new Set()), null);
});

test("prefers the labeled generated image over duplicate presentation images", () => {
  const turns = [{
    turnKey: "conversation-turn-2",
    authorRole: "assistant",
    images: [
      { src: "https://cdn.example/result.png", alt: "Generated image: product cover", id: "result" },
      { src: "https://cdn.example/result.png", alt: "", id: "duplicate" }
    ]
  }];

  assert.equal(selectNewAssistantImage(turns, new Set()).id, "result");
});
