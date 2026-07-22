function inferConversationTurnRole({ ownRole, userMarkerCount, assistantMarkerCount, readyImageCount }) {
  if (ownRole === "user" || ownRole === "assistant") return ownRole;
  if (userMarkerCount > 0) return "user";
  if (assistantMarkerCount > 0) return "assistant";
  if (readyImageCount > 0) return "assistant";
  return null;
}

function selectNewAssistantImage(turns, baselineTurnKeys) {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (turn.authorRole !== "assistant" || baselineTurnKeys.has(turn.turnKey)) continue;
    if (turn.images?.length) {
      return turn.images.find(({ alt = "" }) => (
        /(generated image|ảnh (?:đã|được) tạo|hình (?:ảnh )?(?:đã|được) tạo)/i.test(alt)
      )) || turn.images[0];
    }
  }
  return null;
}

module.exports = { inferConversationTurnRole, selectNewAssistantImage };
