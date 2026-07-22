function selectNewAssistantImage(turns, baselineTurnKeys) {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (turn.authorRole !== "assistant" || baselineTurnKeys.has(turn.turnKey)) continue;
    if (turn.images?.length) return turn.images.at(-1);
  }
  return null;
}

module.exports = { selectNewAssistantImage };
